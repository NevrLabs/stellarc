import type { GitHubConfig } from "../../github/config";
import {
  extractTaskNumber,
  extractTaskNumberFromBranch,
  extractTaskNumberFromPRBody,
  extractTaskNumberFromPRTitle,
  generateBranchName,
} from "../../github/utils/branch-matcher";
import type { GiteaConfig } from "../config";

function asBranchConfig(config: GiteaConfig): GitHubConfig {
  return config as unknown as GitHubConfig;
}

export {
  extractTaskNumberFromPRBody,
  extractTaskNumberFromPRTitle,
  generateBranchName,
};

export function extractTaskNumberFromBranchGitea(
  branchName: string,
  config: GiteaConfig,
  boardSlug: string,
): number | null {
  return extractTaskNumberFromBranch(
    branchName,
    asBranchConfig(config),
    boardSlug,
  );
}

export function extractTaskNumberGitea(
  branchName: string,
  prTitle: string | undefined,
  prBody: string | undefined,
  config: GiteaConfig,
  boardSlug: string,
): number | null {
  return extractTaskNumber(
    branchName,
    prTitle,
    prBody,
    asBranchConfig(config),
    boardSlug,
  );
}
