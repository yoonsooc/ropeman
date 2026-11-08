import { describe, it, expect } from 'vitest';
import { parseGitHubUrl, isGitHubUrl, githubLoadErrorKey } from './githubUrl';

describe('parseGitHubUrl', () => {
	it('parses basic repo URL', () => {
		expect(parseGitHubUrl('https://github.com/facebook/react')).toEqual({
			owner: 'facebook',
			repo: 'react',
			branch: undefined
		});
	});

	it('parses repo URL with trailing slash', () => {
		expect(parseGitHubUrl('https://github.com/facebook/react/')).toEqual({
			owner: 'facebook',
			repo: 'react',
			branch: undefined
		});
	});

	it('parses repo URL with .git suffix', () => {
		expect(parseGitHubUrl('https://github.com/facebook/react.git')).toEqual({
			owner: 'facebook',
			repo: 'react',
			branch: undefined
		});
	});

	it('parses URL with branch', () => {
		expect(parseGitHubUrl('https://github.com/facebook/react/tree/main')).toEqual({
			owner: 'facebook',
			repo: 'react',
			branch: 'main'
		});
	});

	it('parses URL with nested branch name', () => {
		expect(parseGitHubUrl('https://github.com/owner/repo/tree/feature/my-branch')).toEqual({
			owner: 'owner',
			repo: 'repo',
			branch: 'feature/my-branch'
		});
	});

	it('parses http URL', () => {
		expect(parseGitHubUrl('http://github.com/owner/repo')).toEqual({
			owner: 'owner',
			repo: 'repo',
			branch: undefined
		});
	});

	it('trims whitespace', () => {
		expect(parseGitHubUrl('  https://github.com/owner/repo  ')).toEqual({
			owner: 'owner',
			repo: 'repo',
			branch: undefined
		});
	});

	it('handles owner/repo with dots, hyphens, underscores', () => {
		expect(parseGitHubUrl('https://github.com/my-org/my_repo.js')).toEqual({
			owner: 'my-org',
			repo: 'my_repo.js',
			branch: undefined
		});
	});

	it('returns null for empty string', () => {
		expect(parseGitHubUrl('')).toBeNull();
	});

	it('returns null for non-GitHub URL', () => {
		expect(parseGitHubUrl('https://gitlab.com/owner/repo')).toBeNull();
	});

	it('returns null for GitHub URL without repo', () => {
		expect(parseGitHubUrl('https://github.com/owner')).toBeNull();
	});

	it('returns null for random text', () => {
		expect(parseGitHubUrl('not a url at all')).toBeNull();
	});

	it('returns null for GitHub blob URL', () => {
		expect(parseGitHubUrl('https://github.com/owner/repo/blob/main/README.md')).toBeNull();
	});
});

describe('isGitHubUrl', () => {
	it('returns true for valid GitHub URL', () => {
		expect(isGitHubUrl('https://github.com/facebook/react')).toBe(true);
	});

	it('returns false for non-GitHub URL', () => {
		expect(isGitHubUrl('https://gitlab.com/owner/repo')).toBe(false);
	});

	it('returns false for empty string', () => {
		expect(isGitHubUrl('')).toBe(false);
	});
});

describe('githubLoadErrorKey', () => {
	it('maps GitHub statuses to the landing messages', () => {
		expect(githubLoadErrorKey(404)).toBe('landing.githubNotFound');
		expect(githubLoadErrorKey(403)).toBe('landing.githubRateLimit');
		expect(githubLoadErrorKey(401)).toBe('landing.githubPrivate');
		expect(githubLoadErrorKey(500)).toBe('landing.githubLoadError');
		expect(githubLoadErrorKey(undefined)).toBe('landing.githubLoadError');
	});
});
