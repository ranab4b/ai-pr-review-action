import { createIssuesForTodos, postReviewComment } from './githubClient';

function fakeContext(pullRequest: { number: number } | null) {
  return {
    repo: { owner: 'acme', repo: 'widgets' },
    payload: { pull_request: pullRequest }
  } as any;
}

describe('createIssuesForTodos', () => {
  it('creates a new issue for each todo not already tracked', async () => {
    const created: any[] = [];
    const octokit = {
      rest: {
        search: {
          issuesAndPullRequests: jest.fn().mockResolvedValue({ data: { total_count: 0, items: [] } })
        },
        issues: {
          create: jest.fn().mockImplementation(({ title }) => {
            const number = created.length + 1;
            created.push({ number, title });
            return Promise.resolve({ data: { number } });
          })
        }
      }
    } as any;

    const numbers = await createIssuesForTodos(octokit, fakeContext({ number: 5 }), ['fix the thing', 'clean up the other thing'], 5);

    expect(numbers).toEqual([1, 2]);
    expect(octokit.rest.issues.create).toHaveBeenCalledTimes(2);
  });

  it('reuses an existing issue instead of creating a duplicate', async () => {
    const octokit = {
      rest: {
        search: {
          issuesAndPullRequests: jest.fn().mockResolvedValue({
            data: { total_count: 1, items: [{ number: 42 }] }
          })
        },
        issues: {
          create: jest.fn()
        }
      }
    } as any;

    const numbers = await createIssuesForTodos(octokit, fakeContext({ number: 5 }), ['already tracked todo'], 5);

    expect(numbers).toEqual([42]);
    expect(octokit.rest.issues.create).not.toHaveBeenCalled();
  });
});

describe('postReviewComment', () => {
  const review = { summary: 'Looks good overall.', risks: ['risk a'], todoItems: ['todo a'] };

  it('throws when there is no pull_request context', async () => {
    const octokit = {} as any;
    await expect(postReviewComment(octokit, fakeContext(null), review)).rejects.toThrow();
  });

  it('creates a new comment when none exists yet', async () => {
    const octokit = {
      rest: {
        issues: {
          listComments: jest.fn().mockResolvedValue({ data: [] }),
          createComment: jest.fn().mockResolvedValue({}),
          updateComment: jest.fn()
        }
      }
    } as any;

    await postReviewComment(octokit, fakeContext({ number: 7 }), review, [42]);

    expect(octokit.rest.issues.createComment).toHaveBeenCalledTimes(1);
    const body = octokit.rest.issues.createComment.mock.calls[0][0].body;
    expect(body).toContain('risk a');
    expect(body).toContain('todo a (tracked in #42)');
  });

  it('updates the existing comment instead of creating a new one', async () => {
    const octokit = {
      rest: {
        issues: {
          listComments: jest.fn().mockResolvedValue({
            data: [{ id: 99, body: '<!-- ai-pr-review-action:summary -->\nold content' }]
          }),
          createComment: jest.fn(),
          updateComment: jest.fn().mockResolvedValue({})
        }
      }
    } as any;

    await postReviewComment(octokit, fakeContext({ number: 7 }), review);

    expect(octokit.rest.issues.updateComment).toHaveBeenCalledTimes(1);
    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });
});
