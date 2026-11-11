export interface SemanticNode {
	id: string; // "sem:auth-system"
	label: string; // "Authentication System"
	description: string; // AI 생성 1-2줄 설명
	color: string; // 팔레트 색상
	filePaths: string[]; // 소속 파일 경로들
	keySymbols: string[]; // 핵심 함수/클래스명
	parentId: string | null; // 드릴다운 부모 (null=최상위)
	depth: number; // 0=최상위, 1=첫 드릴다운...
	fileCount: number;
}

export interface SemanticEdge {
	id: string;
	source: string;
	target: string;
	label?: string; // "authenticates", "reads from"
	type: 'depends_on' | 'calls' | 'extends' | 'uses';
}

export interface AssignmentCounts {
	leftOut: number; // 어떤 역할에도 없어서 미분류 노드로 간 입력 파일 수
	duplicated: number; // 이미 배정된 파일을 다시 적어 버린 항목 수
	invented: number; // 입력에 없는 경로라 버린 항목 수
}

export interface SemanticLevel {
	parentId: string | null;
	nodes: SemanticNode[];
	edges: SemanticEdge[];
	breadcrumbLabel: string;
	assignment?: AssignmentCounts; // 이 필드 이전에 캐시·공유된 레벨에는 없다
}
