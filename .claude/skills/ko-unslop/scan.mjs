#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const patterns = [
	[1, '것이 중요', /것이 중요/],
	[2, '~를 통해', /[을를] 통해/],
	[3, 'filler adjective', /다양한|효율적|원활한|강력한|손쉽게|간편하게|최적의|혁신적/],
	[4, 'nominalization', /[을를] (진행|수행)|(진행|수행)합니다/],
	[5, 'translationese', /에 대해|에 대한|[이가] 가능합니다/],
	[6, 'double passive', /되어지|되어집|되어져/],
	[7, 'empty emphasis', /안심하셔도|절대|어떠한 경우에도|완벽하게|100%|안전하게/],
	[8, 'contrast frame', /단순히 .{0,30}아니라|뿐만 아니라/],
	[9, 'arrow or dash', /→|->| — |—|–/],
	[10, 'English label in Korean', /Settings|Share 버튼|pill/]
];

const files = process.argv.slice(2);
if (files.length === 0) {
	console.error('usage: node scan.mjs <file>...');
	process.exit(2);
}

let total = 0;
for (const file of files) {
	readFileSync(file, 'utf8')
		.split('\n')
		.forEach((line, i) => {
			if (!/[가-힣]/.test(line)) return;
			for (const [id, name, re] of patterns) {
				if (re.test(line)) {
					total++;
					console.log(`${file}:${i + 1}: #${id} ${name}: ${line.trim().slice(0, 100)}`);
				}
			}
		});
}
console.log(`${total} hit(s)`);
