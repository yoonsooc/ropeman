// --- CORS ---
export function getAllowedOrigin(requestOrigin: string | null, allowedList: string): string {
	if (!allowedList) return '';
	const origins = allowedList.split(',').map((o) => o.trim());
	if (requestOrigin && origins.includes(requestOrigin)) return requestOrigin;
	return '';
}

export function corsHeaders(origin: string) {
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
		'Access-Control-Max-Age': '86400',
	};
}

// --- Gemini API 호출 ---
export async function callGemini(
	apiKey: string,
	model: string,
	messages: Array<{ role: string; content: string }>,
	systemPrompt?: string,
): Promise<Response> {
	const contents = messages.map((m) => ({
		role: m.role === 'assistant' ? 'model' : 'user',
		parts: [{ text: m.content }],
	}));

	const body: Record<string, unknown> = {
		contents,
		generationConfig: {
			maxOutputTokens: 16384,
		},
	};

	if (systemPrompt) {
		body.systemInstruction = { parts: [{ text: systemPrompt }] };
	}

	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
	return fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
}

// --- 공통 에러 응답 ---
export function jsonResponse(data: unknown, status: number, headers: Record<string, string>): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { ...headers, 'Content-Type': 'application/json' },
	});
}

// --- CORS preflight 처리 ---
export function handleCors(request: Request, allowedOrigins: string): { origin: string; headers: Record<string, string> } | Response {
	const requestOrigin = request.headers.get('Origin');
	const origin = getAllowedOrigin(requestOrigin, allowedOrigins);
	if (!origin) {
		return new Response('Origin not allowed', { status: 403 });
	}
	const headers = corsHeaders(origin);

	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers });
	}

	if (request.method !== 'POST') {
		return new Response('Method not allowed', { status: 405, headers });
	}

	return { origin, headers };
}
