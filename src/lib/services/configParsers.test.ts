import { describe, it, expect } from 'vitest';
import type { ASTSymbol } from '$lib/types/ast';
import { parseDockerfile, parseDotenv, parseMakefile, parseTerraform } from './configParsers';
import { buildCodeMap, fileFromAst, formatPayloadPreview, toWireFile } from './skeletonExtractor';

const source = (...lines: string[]) => lines.join('\n');

/** name, kind, lines and children only, so a failure prints the outline. */
function outline(symbols: ASTSymbol[]): unknown[] {
	return symbols.map((sym) => ({
		name: sym.name,
		kind: sym.kind,
		lines: [sym.lineStart, sym.lineEnd],
		...(sym.children?.length ? { children: outline(sym.children) } : {})
	}));
}

describe('parseDockerfile', () => {
	const multiStage = source(
		'# syntax=docker/dockerfile:1.6',
		'ARG NODE_VERSION=20',
		'FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS deps',
		'WORKDIR /app',
		'COPY package.json package-lock.json ./',
		'RUN npm ci',
		'',
		'FROM deps AS build',
		'COPY . .',
		'RUN <<EOF',
		'npm run build',
		'FROM fake:image',
		'EOF',
		'',
		'FROM gcr.io/distroless/nodejs20-debian12 AS runtime',
		'COPY --from=build /app/dist /app/dist',
		'COPY ["config/default.json", "/app/config/"]',
		'EXPOSE 8080 9090/udp',
		'ENTRYPOINT ["node", \\',
		'    # comment inside a continuation',
		'    "/app/dist/server.js"]',
		'CMD ["--port", "8080"]'
	);

	it('reads each stage with its ports and commands, and images and copied paths as imports', () => {
		expect(outline(parseDockerfile(multiStage))).toEqual([
			{ name: 'node:${NODE_VERSION}-alpine', kind: 'import', lines: [3, 3] },
			{ name: 'deps', kind: 'stage', lines: [3, 6] },
			{ name: 'package.json', kind: 'import', lines: [5, 5] },
			{ name: 'package-lock.json', kind: 'import', lines: [5, 5] },
			{ name: 'build', kind: 'stage', lines: [8, 13] },
			{ name: '.', kind: 'import', lines: [9, 9] },
			{ name: 'gcr.io/distroless/nodejs20-debian12', kind: 'import', lines: [15, 15] },
			{
				name: 'runtime',
				kind: 'stage',
				lines: [15, 22],
				children: [
					{ name: '8080', kind: 'port', lines: [18, 18] },
					{ name: '9090/udp', kind: 'port', lines: [18, 18] },
					{ name: 'ENTRYPOINT ["node", "/app/dist/server.js"]', kind: 'command', lines: [19, 21] },
					{ name: 'CMD ["--port", "8080"]', kind: 'command', lines: [22, 22] }
				]
			},
			{ name: 'config/default.json', kind: 'import', lines: [17, 17] }
		]);
	});

	it('names an unaliased stage by its image and skips scratch', () => {
		const symbols = parseDockerfile(
			source('from scratch', 'FROM python:3.12-slim', 'cmd python app.py')
		);

		expect(outline(symbols)).toEqual([
			{ name: 'scratch', kind: 'stage', lines: [1, 1] },
			{ name: 'python:3.12-slim', kind: 'import', lines: [2, 2] },
			{
				name: 'python:3.12-slim',
				kind: 'stage',
				lines: [2, 3],
				children: [{ name: 'CMD python app.py', kind: 'command', lines: [3, 3] }]
			}
		]);
	});

	it('follows the escape parser directive', () => {
		const symbols = parseDockerfile(
			source(
				'# escape=`',
				'FROM mcr.microsoft.com/windows/servercore',
				'COPY app.ps1 `',
				'  C:\\app\\'
			)
		);

		expect(symbols.filter((sym) => sym.kind === 'import').map((sym) => sym.name)).toEqual([
			'mcr.microsoft.com/windows/servercore',
			'app.ps1'
		]);
	});
});

describe('parseTerraform', () => {
	const modules = source(
		'terraform {',
		'  required_providers {',
		'    aws = { source = "hashicorp/aws" }',
		'  }',
		'}',
		'',
		'variable "region" {',
		'  type    = string',
		'  default = "us-east-1"',
		'}',
		'',
		'module "vpc" {',
		'  source = "./modules/vpc"',
		'  tags   = { Name = "${var.prefix}-vpc" }',
		'}',
		'',
		'module "eks" {',
		'  source  = "terraform-aws-modules/eks/aws"',
		'  version = "~> 20.0"',
		'  vpc_id  = module.vpc.vpc_id',
		'}',
		'',
		'resource "aws_iam_policy" "logs" {',
		'  # a brace in a comment: {',
		'  /* and in a block comment: {',
		'     } } */',
		'  policy = <<-EOT',
		'    {"Statement": [{',
		'    EOT',
		'  description = "uses ${jsonencode({ a = "}" })} braces"',
		'}',
		'',
		'data "aws_ami" "ubuntu" {',
		'  most_recent = true',
		'}',
		'',
		'output "vpc_id" {',
		'  value = module.vpc.vpc_id',
		'}'
	);

	it('reads each top-level block to its matching brace, and module sources as imports', () => {
		expect(outline(parseTerraform(modules))).toEqual([
			{ name: 'region', kind: 'input', lines: [7, 10] },
			{ name: 'module.vpc', kind: 'resource', lines: [12, 15] },
			{ name: './modules/vpc', kind: 'import', lines: [13, 13] },
			{ name: 'module.eks', kind: 'resource', lines: [17, 21] },
			{ name: 'terraform-aws-modules/eks/aws', kind: 'import', lines: [18, 18] },
			{ name: 'aws_iam_policy.logs', kind: 'resource', lines: [23, 31] },
			{ name: 'data.aws_ami.ubuntu', kind: 'resource', lines: [33, 35] },
			{ name: 'vpc_id', kind: 'output', lines: [37, 39] }
		]);
	});

	it('reads one-line blocks and a block left open to the end of the file', () => {
		const symbols = parseTerraform(
			source('variable "a" {}', 'output "b" { value = 1 }', 'resource "x" "y" {', '  n = 1')
		);

		expect(outline(symbols)).toEqual([
			{ name: 'a', kind: 'input', lines: [1, 1] },
			{ name: 'b', kind: 'output', lines: [2, 2] },
			{ name: 'x.y', kind: 'resource', lines: [3, 4] }
		]);
	});
});

const SECRET_ENV = source(
	'# Database',
	'export DATABASE_URL="postgres://app:s3cr3t-db@db:5432/app"',
	'REDIS_URL=redis://:hunter2-redis@cache:6379 # inline comment',
	"API_KEY='sk-live-quoted-secret'",
	'EMPTY=',
	'SPACED = value-with-spaces-secret',
	'PRIVATE_KEY="-----BEGIN PRIVATE KEY-----',
	'NOT_A_KEY=inside-the-pem-secret',
	'-----END PRIVATE KEY-----"',
	'YAML_STYLE: colon-secret',
	'  # indented comment',
	'lowercase.key-name=dotted-secret',
	'BROKEN="never-closed-secret',
	'AFTER_BROKEN=after-secret'
);

const SECRET_VALUES = [
	'postgres://',
	's3cr3t-db',
	'hunter2-redis',
	'sk-live-quoted-secret',
	'value-with-spaces-secret',
	'BEGIN PRIVATE KEY',
	'NOT_A_KEY',
	'inside-the-pem-secret',
	'colon-secret',
	'dotted-secret',
	'never-closed-secret',
	'after-secret'
];

describe('parseDotenv', () => {
	it('reads each key with the lines its value spans', () => {
		expect(outline(parseDotenv(SECRET_ENV))).toEqual([
			{ name: 'DATABASE_URL', kind: 'env', lines: [2, 2] },
			{ name: 'REDIS_URL', kind: 'env', lines: [3, 3] },
			{ name: 'API_KEY', kind: 'env', lines: [4, 4] },
			{ name: 'EMPTY', kind: 'env', lines: [5, 5] },
			{ name: 'SPACED', kind: 'env', lines: [6, 6] },
			{ name: 'PRIVATE_KEY', kind: 'env', lines: [7, 9] },
			{ name: 'YAML_STYLE', kind: 'env', lines: [10, 10] },
			{ name: 'lowercase.key-name', kind: 'env', lines: [12, 12] },
			{ name: 'BROKEN', kind: 'env', lines: [13, 13] },
			{ name: 'AFTER_BROKEN', kind: 'env', lines: [14, 14] }
		]);
	});

	it('never puts a value in the symbols, the code map or the wire', () => {
		const symbols = parseDotenv(SECRET_ENV);
		const record = fileFromAst('repo/.env', symbols);
		const outputs = [
			JSON.stringify(symbols),
			JSON.stringify(record),
			JSON.stringify([...buildCodeMap(new Map([['repo/.env', symbols]]), 'repo').files]),
			formatPayloadPreview({
				projectName: 'repo',
				totalFiles: 1,
				totalSymbols: symbols.length,
				files: [toWireFile('.env', record)!]
			})
		];

		for (const output of outputs) {
			expect(output).toContain('DATABASE_URL');
			for (const value of SECRET_VALUES) expect(output).not.toContain(value);
		}
	});

	it('reads every key and no value from well-formed values full of quotes, separators and newlines', () => {
		// A newline ends an unquoted value, so only quoted values may hold one, as dotenv reads them
		const marks = ['"', "'", '`', '=', '#', ':', ' ', '\\', '\n', 'KEY_X='];
		let seed = 7;
		const next = () => (seed = (seed * 48271) % 2147483647);
		const lines: string[] = [];
		for (let i = 0; i < 300; i++) {
			let value = '';
			for (let j = 0; j < 6; j++) value += marks[next() % marks.length] + 'zqx';
			const quote = ['"', "'", '`'][next() % 3];
			const quoted = next() % 2 === 0;
			const written = quoted
				? quote + value.replace(/\\/g, '\\\\').replaceAll(quote, '\\' + quote) + quote
				: 'zqx' + value.replace(/\n/g, ' ');
			lines.push(`${next() % 2 ? 'export ' : ''}KEY_${i}${next() % 2 ? ' = ' : '='}${written}`);
		}

		const symbols = parseDotenv(lines.join('\n'));

		expect(symbols.map((sym) => sym.name)).toEqual(lines.map((_, i) => `KEY_${i}`));
		expect(JSON.stringify(symbols)).not.toContain('zqx');
	});
});

describe('parseMakefile', () => {
	const makefile = source(
		'include config.mk',
		'-include $(DEPS)',
		'',
		'CC := gcc',
		'SRCS = $(wildcard src/*.c)',
		'OBJS = $(SRCS:.c=.o)',
		'URL = https://example.com:8080/path',
		'',
		'.PHONY: all clean test',
		'',
		'all: app # default',
		'',
		'app: $(OBJS) | build-dir',
		'\t$(CC) -o $@ $^',
		'',
		'%.o: %.c config.h',
		'\t$(CC) -c $< -o $@',
		'',
		'$(OBJS): %.o: %.c',
		'',
		'build-dir:',
		'\tmkdir -p build',
		'',
		'test: CFLAGS += -g',
		'test: app',
		'\t./app --self-test \\',
		'\t  --verbose',
		'',
		'define HELP',
		'usage: make all',
		'endef',
		'',
		'clean:',
		'\trm -rf build *.o'
	);

	it('reads targets with their prerequisites, pattern rules and includes', () => {
		const prerequisite = (name: string, line: number) => ({
			name,
			kind: 'import',
			lines: [line, line]
		});

		expect(outline(parseMakefile(makefile))).toEqual([
			{ name: 'config.mk', kind: 'import', lines: [1, 1] },
			{ name: '$(DEPS)', kind: 'import', lines: [2, 2] },
			{ name: 'all', kind: 'target', lines: [11, 11], children: [prerequisite('app', 11)] },
			{
				name: 'app',
				kind: 'target',
				lines: [13, 14],
				children: [prerequisite('$(OBJS)', 13), prerequisite('build-dir', 13)]
			},
			{
				name: '%.o',
				kind: 'target',
				lines: [16, 17],
				children: [prerequisite('%.c', 16), prerequisite('config.h', 16)]
			},
			{ name: '$(OBJS)', kind: 'target', lines: [19, 19], children: [prerequisite('%.c', 19)] },
			{ name: 'build-dir', kind: 'target', lines: [21, 22] },
			{ name: 'test', kind: 'target', lines: [25, 27], children: [prerequisite('app', 25)] },
			{ name: 'clean', kind: 'target', lines: [33, 34] }
		]);
	});

	it('gives every target of a multi-target rule the same prerequisites', () => {
		const symbols = parseMakefile(source('lint fmt:: node_modules', '\tnpx prettier .'));

		expect(outline(symbols)).toEqual([
			{
				name: 'lint',
				kind: 'target',
				lines: [1, 2],
				children: [{ name: 'node_modules', kind: 'import', lines: [1, 1] }]
			},
			{
				name: 'fmt',
				kind: 'target',
				lines: [1, 2],
				children: [{ name: 'node_modules', kind: 'import', lines: [1, 1] }]
			}
		]);
	});
});
