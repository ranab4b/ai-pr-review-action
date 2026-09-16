import { createHash } from 'node:crypto';
import type { getOctokit } from '@actions/github';
import type { Context } from '@actions/github/lib/context';
import type { ReviewResult } from './llmClient';

type Octokit = ReturnType<typeof getOctokit>;

function todoMarker(todo: string): string {
  const hash = createHash('sha1').update(todo).digest('hex').slice(0, 12);
  return `<!-- ai-pr-review-action:todo:${hash} -->`;
}

/**
 * Opens one GitHub issue per flagged TODO item, skipping any item that
 * already has an open issue from a previous run of this action (matched
 * via a hidden marker in the issue body) so re-running on the same PR
 * doesn't create duplicates.
 */
export async function createIssuesForTodos(
  octokit: Octokit,
  context: Context,
  todoItems: string[],
  prNumber: number
): Promise<number[]> {
  const { owner, repo } = context.repo;
  const createdIssueNumbers: number[] = [];

  for (const todo of todoItems) {
    const marker = todoMarker(todo);

    const existing = await octokit.rest.search.issuesAndPullRequests({
      q: `repo:${owner}/${repo} is:issue in:body "${marker}"`
    });

    if (existing.data.total_count > 0) {
      createdIssueNumbers.push(existing.data.items[0].number);
      continue;
    }

    const title = todo.length > 80 ? `${todo.slice(0, 77)}...` : todo;

    const issue = await octokit.rest.issues.create({
      owner,
      repo,
      title: `[AI Review] ${title}`,
      body: [
        `Follow-up item flagged by the AI PR review on #${prNumber}.`,
        '',
        todo,
        '',
        marker
      ].join('\n'),
      labels: ['ai-review']
    });

    createdIssueNumbers.push(issue.data.number);
  }

  return createdIssueNumbers;
}

function formatList(items: string[]): string {
  if (items.length === 0) return '_None found._';
  return items.map((item) => `- ${item}`).join('\n');
}

function formatTodoList(todoItems: string[], issueNumbers: number[]): string {
  if (todoItems.length === 0) return '_None found._';
  return todoItems
    .map((item, index) => {
      const issueNumber = issueNumbers[index];
      const tracked = issueNumber ? ` (tracked in #${issueNumber})` : '';
      return `- ${item}${tracked}`;
    })
    .join('\n');
}

/**
 * Posts (or updates) the AI review as a single issue comment on the PR.
 */
export async function postReviewComment(
  octokit: Octokit,
  context: Context,
  review: ReviewResult,
  todoIssueNumbers: number[] = []
): Promise<void> {
  const pullRequest = context.payload.pull_request;
  if (!pullRequest) {
    throw new Error('No pull_request context found; cannot post a review comment.');
  }

  const marker = '<!-- ai-pr-review-action:summary -->';

  const body = [
    marker,
    '## 🤖 AI PR Review',
    '',
    review.summary || '_No summary was generated._',
    '',
    '### Risks',
    formatList(review.risks),
    '',
    '### Follow-up items',
    formatTodoList(review.todoItems, todoIssueNumbers)
  ].join('\n');

  const { owner, repo } = context.repo;

  const comments = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: pullRequest.number
  });
  const existing = comments.data.find((comment) => comment.body?.includes(marker));

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body
    });
    return;
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: pullRequest.number,
    body
  });
}
