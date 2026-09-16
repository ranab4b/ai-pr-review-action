import type { getOctokit } from '@actions/github';
import type { Context } from '@actions/github/lib/context';

type Octokit = ReturnType<typeof getOctokit>;

/**
 * Fetches the unified diff for the pull request that triggered this run,
 * using the GitHub API's diff media type so we get the same text a
 * reviewer would see in the "Files changed" tab.
 */
export async function getPullRequestDiff(octokit: Octokit, context: Context): Promise<string> {
  const pullRequest = context.payload.pull_request;
  if (!pullRequest) {
    throw new Error('No pull_request context found. This must run on a pull_request event, or provide diff-file for a local diff.');
  }

  const response = await octokit.rest.pulls.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: pullRequest.number,
    mediaType: { format: 'diff' }
  });

  // With mediaType.format 'diff', the API returns the raw diff text as
  // response.data, but the generated types still describe the JSON shape.
  return response.data as unknown as string;
}
