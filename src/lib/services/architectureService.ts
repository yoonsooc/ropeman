import { authStore } from '$lib/stores/authStore.svelte';
import { architectureStore, type ArchitectureGroup } from '$lib/stores/architectureStore.svelte';
import { extractSkeleton, formatPayloadPreview } from './skeletonExtractor';
import { settingsStore } from '$lib/stores/settingsStore.svelte';
import { graphStore } from '$lib/stores/graphStore.svelte';
import { projectStore } from '$lib/stores/projectStore.svelte';

const GEMINI_ENDPOINT =
	'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const GROUP_COLORS = [
	'#89b4fa',
	'#a6e3a1',
	'#f9e2af',
	'#f38ba8',
	'#cba6f7',
	'#94e2d5',
	'#fab387',
	'#74c7ec'
];

const SYSTEM_PROMPT = `You are a code architecture analyzer. Given a project skeleton (file paths, symbol names, imports), identify logical architectural groups.

Return ONLY valid JSON array with this format:
[
  { "name": "Group Name", "nodeIds": ["node:path/to/file1", "node:path/to/file2"] }
]

Rules:
- Group files by their architectural role (e.g., "Model Layer", "API Routes", "Services", "Utils", "Components", "Config")
- Use "node:" prefix + file path for nodeIds (matching the graph node ID format)
- Create 3-7 groups maximum
- Every file should belong to exactly one group
- Group names should be concise (2-3 words)`;

export async function analyzeArchitecture(): Promise<void> {
	if (architectureStore.isAnalyzing) return;

	architectureStore.isAnalyzing = true;
	architectureStore.groups = [];

	try {
		const skeleton = extractSkeleton(
			projectStore.projectName,
			projectStore.fileTree,
			projectStore.astMap
		);
		if (skeleton.files.length === 0) {
			throw new Error('No files to analyze');
		}

		const prompt = `Analyze this project structure and group files by architectural role:\n\n${formatPayloadPreview(skeleton)}`;

		let responseText: string;
		const track = authStore.activeTrack;

		if (track === 'byok') {
			responseText = await callGemini(prompt);
		} else {
			throw new Error('AI not connected');
		}

		const groups = parseGroups(responseText);
		architectureStore.groups = groups;
		architectureStore.enabled = true;
	} catch (error) {
		console.error('Architecture analysis failed:', error);
		architectureStore.groups = [];
	} finally {
		architectureStore.isAnalyzing = false;
	}
}

async function callGemini(prompt: string): Promise<string> {
	const apiKey = settingsStore.geminiApiKey;
	if (!apiKey) throw new Error('No API key');

	const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
			contents: [{ role: 'user', parts: [{ text: prompt }] }],
			generationConfig: {
				temperature: 0.3,
				maxOutputTokens: 4096
			}
		})
	});

	if (!response.ok) {
		throw new Error(`Gemini API error: HTTP ${response.status}`);
	}

	const data = await response.json();
	return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseGroups(text: string): ArchitectureGroup[] {
	// Extract JSON from response (may be wrapped in markdown code block)
	const jsonMatch = text.match(/\[[\s\S]*\]/);
	if (!jsonMatch) return [];

	try {
		const raw = JSON.parse(jsonMatch[0]) as Array<{ name: string; nodeIds: string[] }>;

		// Validate nodeIds against actual graph nodes
		const validNodeIds = new Set(graphStore.nodes.map((n) => n.id));

		return raw
			.map((group, i) => ({
				name: group.name,
				color: GROUP_COLORS[i % GROUP_COLORS.length],
				nodeIds: group.nodeIds.filter((id) => validNodeIds.has(id))
			}))
			.filter((g) => g.nodeIds.length > 0);
	} catch {
		return [];
	}
}
