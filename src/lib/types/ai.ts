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

type ErrorLocale = 'ko' | 'en';
type Localized = Record<ErrorLocale, string>;

/** 에러 유형별 사용자 안내 메시지 및 액션 */
const ERROR_INFO_MAP: Record<
	AIErrorType,
	{ message: Localized; actions: Array<{ label: Localized; target: AIErrorAction['target'] }> }
> = {
	[AIErrorType.TPM_EXCEEDED]: {
		message: {
			ko: '요청이 모델의 토큰 한도를 초과했습니다. 코드 구조 요약 크기를 줄이거나 다른 모델을 선택하세요.',
			en: "The request exceeds the model's token limit. Reduce the code summary size or choose another model."
		},
		actions: [
			{ label: { ko: '크기 설정', en: 'Size settings' }, target: 'analyze' },
			{ label: { ko: '모델 변경', en: 'Change model' }, target: 'analyze' }
		]
	},
	[AIErrorType.RATE_LIMIT]: {
		message: {
			ko: '요청 빈도 한도 초과. 잠시 후 다시 시도해주세요.',
			en: 'Too many requests. Please try again shortly.'
		},
		actions: []
	},
	[AIErrorType.INSUFFICIENT_QUOTA]: {
		message: {
			ko: 'API 크레딧이 부족합니다. Provider 대시보드에서 충전하세요.',
			en: "Not enough API credit. Top up in your provider's dashboard."
		},
		actions: []
	},
	[AIErrorType.AUTH_ERROR]: {
		message: {
			ko: 'API Key가 유효하지 않습니다. 키를 확인하고 다시 입력하세요.',
			en: 'The API key is not valid. Check the key and enter it again.'
		},
		actions: [{ label: { ko: 'API Key 확인', en: 'Check API key' }, target: 'analyze' }]
	},
	[AIErrorType.NETWORK_ERROR]: {
		message: { ko: '네트워크 연결을 확인하세요.', en: 'Check your network connection.' },
		actions: []
	},
	[AIErrorType.DEMO_UNAVAILABLE]: {
		message: {
			ko: '무료 데모를 지금은 쓸 수 없습니다. Explore에서 미리 분석된 예시를 보거나, API 키나 로컬 브리지(Claude Code, Gemini CLI)를 연결해 직접 분석하세요.',
			en: 'The free demo is unavailable right now. Browse pre-analyzed examples in Explore, or connect an API key or the local bridge (Claude Code, Gemini CLI) to analyze your own code.'
		},
		actions: [
			{ label: { ko: 'Explore 보기', en: 'Open Explore' }, target: 'explore' },
			{ label: { ko: '다른 AI 연결', en: 'Connect another AI' }, target: 'analyze' }
		]
	},
	[AIErrorType.UNKNOWN]: {
		message: {
			ko: 'AI 분석 중 오류가 발생했습니다.',
			en: 'Something went wrong during AI analysis.'
		},
		actions: []
	}
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
	rawMessage?: string,
	locale: ErrorLocale = 'ko'
): AIErrorInfo {
	const info = ERROR_INFO_MAP[errorType];
	return {
		type: errorType,
		message: errorType === AIErrorType.UNKNOWN && rawMessage ? rawMessage : info.message[locale],
		actions: info.actions.map((a) => ({ label: a.label[locale], target: a.target }))
	};
}
