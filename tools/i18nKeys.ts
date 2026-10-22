/** 列出所有 tr('…') 的鍵（給 src/i18n/enText.ts 用）：npx tsx tools/i18nKeys.ts <輸出.json> */
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import ts from 'typescript';

const keys = new Set<string>();
for (const f of globSync('src/**/*.ts')) {
  const sf = ts.createSourceFile(f, readFileSync(f, 'utf-8'), ts.ScriptTarget.Latest, true);
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tr' && n.arguments[0] && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))) keys.add(n.arguments[0].text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
writeFileSync(process.argv[2], JSON.stringify([...keys].filter((k) => /[一-鿿　-〿＀-￯]/.test(k)).sort(), null, 1));
console.log(keys.size);
