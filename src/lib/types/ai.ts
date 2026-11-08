/**
 * Discriminated union for AI service results.
 * Allows callers to distinguish success from failure structurally
 * instead of inspecting string content.
 */
export type AIResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

// --- U4: AI 에러 유형 분류 ---

export enum AIErrorType {
	/** 토큰 한도 초과 (429 + tokens/TPM 관련 메시지) */
	TPM_EXCEEDED = 'tpm_exceeded',
	/** 요청 빈도 한도 초과 (429, 비토큰) */
	RATE_LIMIT = 'rate_limit',
	/** API 크레딧/할당량 부족 (402 또는 429 quota) */
	INSUFFICIENT_QUOTA = 'insufficient_quota',
	/** 인증 실패 (401/403) */
	AUTH_ERROR = 'auth_error',
	/** 네트워크 에러 (fetch 실패, DNS, timeout 등) */
	NETWORK_ERROR = 'network_error',
	/** 무료 데모가 지금 응답할 수 없음 (할당량 소진, 업스트림 장애 등) */
	DEMO_UNAVAILABLE = 'demo_unavailable',
	/** 분류 불가 */
	UNKNOWN = 'unknown'
}

export interface AIErrorInfo {
	type: AIErrorType;
	message: string;
	/** 사용자에게 보여줄 액션 버튼 목록 */
	actions: AIErrorAction[];
}

export interface AIErrorAction {
	label: string;
	/** 클릭 시 열 모달, 또는 이동할 페이지 */
	target: 'analyze' | 'settings' | 'explore';
}

/** 에러 유형별 안내 문구와 액션. 값은 i18nStore 키 (aiError.*) */
const ERROR_INFO_MAP: Record<
	AIErrorType,
	{ message: string; actions: Array<{ label: string; target: AIErrorAction['target'] }> }
> = {
	[AIErrorType.TPM_EXCEEDED]: {
		message: 'aiError.tpm',
		actions: [
			{ label: 'aiError.actionSize', target: 'analyze' },
			{ label: 'aiError.actionModel', target: 'analyze' }
		]
	},
	[AIErrorType.RATE_LIMIT]: { message: 'aiError.rateLimit', actions: [] },
	[AIErrorType.INSUFFICIENT_QUOTA]: { message: 'aiError.quota', actions: [] },
	[AIErrorType.AUTH_ERROR]: {
		message: 'aiError.auth',
		actions: [{ label: 'aiError.actionKey', target: 'analyze' }]
	},
	[AIErrorType.NETWORK_ERROR]: { message: 'aiError.network', actions: [] },
	[AIErrorType.DEMO_UNAVAILABLE]: {
		message: 'aiError.demo',
		actions: [
			{ label: 'aiError.actionExplore', target: 'explore' },
			{ label: 'aiError.actionConnect', target: 'analyze' }
		]
	},
	[AIErrorType.UNKNOWN]: { message: 'aiError.unknown', actions: [] }
};

/**
 * 에러 메시지와 HTTP 상태 코드로부터 에러 유형을 분류한다.
 *
 * @param errorMessage - Error.message 또는 API 에러 문자열
 * @param httpStatus - HTTP 응답 상태 코드 (있는 경우)
 */
export function classifyAIError(errorMessage: string, httpStatus?: number): AIErrorType {
	const msg = errorMessage.toLowerCase();

	// 데모 실패 (aiAdapter.demoFailureMessage). 메시지에 402/403이 섞여 있어 가장 먼저 본다
	if (msg.startsWith('demo unavailable')) {
		return AIErrorType.DEMO_UNAVAILABLE;
	}

	// 네트워크 에러 (fetch 자체 실패)
	if (
		msg.includes('failed to fetch') ||
		msg.includes('networkerror') ||
		msg.includes('network error') ||
		msg.includes('net::') ||
		msg.includes('dns') ||
		msg.includes('econnrefused') ||
		msg.includes('enotfound') ||
		msg.includes('timeout') ||
		msg.includes('aborted')
	) {
		return AIErrorType.NETWORK_ERROR;
	}

	// 인증 실패 (401/403)
	if (httpStatus === 401 || httpStatus === 403) {
		return AIErrorType.AUTH_ERROR;
	}
	if (
		msg.includes('401') ||
		msg.includes('403') ||
		msg.includes('invalid api key') ||
		msg.includes('invalid x-goog-api-key') ||
		msg.includes('api key not valid') ||
		msg.includes('permission denied') ||
		msg.includes('authentication') ||
		msg.includes('unauthorized')
	) {
		return AIErrorType.AUTH_ERROR;
	}

	// 크레딧 부족 (402 또는 429 + quota 관련)
	if (httpStatus === 402) {
		return AIErrorType.INSUFFICIENT_QUOTA;
	}
	if (
		msg.includes('insufficient_quota') ||
		msg.includes('insufficient quota') ||
		msg.includes('billing') ||
		msg.includes('payment required') ||
		msg.includes('exceeded your current quota')
	) {
		return AIErrorType.INSUFFICIENT_QUOTA;
	}

	// TPM 초과 (429 + 토큰 관련 키워드)
	if (httpStatus === 429 || msg.includes('429') || msg.includes('rate limit')) {
		if (
			msg.includes('token') ||
			msg.includes('tpm') ||
			msg.includes('too many tokens') ||
			msg.includes('context length') ||
			msg.includes('max_tokens')
		) {
			return AIErrorType.TPM_EXCEEDED;
		}

		// quota 관련이면 INSUFFICIENT_QUOTA로
		if (msg.includes('quota')) {
			return AIErrorType.INSUFFICIENT_QUOTA;
		}

		return AIErrorType.RATE_LIMIT;
	}

	// 토큰 관련 에러 (429 없이도)
	if (
		msg.includes('context length exceeded') ||
		msg.includes('maximum context length') ||
		msg.includes('too many tokens') ||
		msg.includes('request too large')
	) {
		return AIErrorType.TPM_EXCEEDED;
	}

	return AIErrorType.UNKNOWN;
}

/**
 * 에러 유형에 맞는 사용자 친화적 메시지와 액션을 반환한다.
 */
export function getAIErrorInfo(
	errorType: AIErrorType,
	rawMessage: string | undefined,
	t: (key: string) => string
): AIErrorInfo {
	const info = ERROR_INFO_MAP[errorType];
	return {
		type: errorType,
		message: errorType === AIErrorType.UNKNOWN && rawMessage ? rawMessage : t(info.message),
		actions: info.actions.map((a) => ({ label: t(a.label), target: a.target }))
	};
}
