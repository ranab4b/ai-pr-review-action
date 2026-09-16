import { readFileSync } from 'node:fs';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { getPullRequestDiff } from './diffParser';
import { reviewDiff } from './llmClient';
import { createIssuesForTodos, postReviewComment } from './githubClient';

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput('api-key', { required: true });
    const apiUrl = core.getInput('api-url') || 'https://api.anthropic.com/v1/messages';
    const model = core.getInput('model') || 'claude-sonnet-5';
    const githubToken = core.getInput('github-token') || process.env.GITHUB_TOKEN || '';
    const diffFile = core.getInput('diff-file');
    const createIssues = core.getBooleanInput('create-issues');

    const context = github.context;
    const octokit = github.getOctokit(githubToken);

    const diff = diffFile
      ? readFileSync(diffFile, 'utf8')
      : await getPullRequestDiff(octokit, context);

    if (!diff.trim()) {
      core.warning('Diff is empty; nothing to review.');
      core.setOutput('summary', '');
      core.setOutput('risks', '[]');
      core.setOutput('todo-items', '[]');
      return;
    }

    core.info(`Reviewing diff (${diff.length} chars) with model ${model}...`);
    const review = await reviewDiff(diff, { apiKey, apiUrl, model });

    core.setOutput('summary', review.summary);
    core.setOutput('risks', JSON.stringify(review.risks));
    core.setOutput('todo-items', JSON.stringify(review.todoItems));

    await core.summary
      .addHeading('AI PR Review')
      .addRaw(review.summary || 'No summary was generated.', true)
      .addHeading('Risks', 3)
      .addList(review.risks.length ? review.risks : ['None found.'])
      .addHeading('Follow-up items', 3)
      .addList(review.todoItems.length ? review.todoItems : ['None found.'])
      .write();

    const pullRequest = context.payload.pull_request;

    if (!pullRequest) {
      core.info('No pull_request event context found (self-test / local diff mode) — skipping comment and issue creation.');
      core.setOutput('comment-posted', 'false');
      return;
    }

    let issueNumbers: number[] = [];
    if (createIssues && review.todoItems.length > 0) {
      issueNumbers = await createIssuesForTodos(octokit, context, review.todoItems, pullRequest.number);
      core.info(`Opened/matched ${issueNumbers.length} issue(s) for follow-up items.`);
    }

    await postReviewComment(octokit, context, review, issueNumbers);
    core.setOutput('comment-posted', 'true');
    core.info(`Posted review comment on PR #${pullRequest.number}.`);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
