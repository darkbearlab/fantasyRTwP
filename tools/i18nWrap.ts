/**
 * 一次性的工具（Alan 2026-10-22 介面英文化）：把指定檔案裡含中文的字串字面值包成 tr(...)。
 *   npx tsx tools/i18nWrap.ts <檔案…>        改寫檔案
 *   npx tsx tools/i18nWrap.ts --keys <檔案…> 只列出所有 tr() 的鍵（給 enText.ts 用）
 * 不動的：比較運算（=== !==）兩邊、case 標籤、物件的鍵、import、已經在 tr() 裡的、型別。
 * 樣板字串的 ${…} 變成 {0}、{1}…，tr('…{0}…', { 0: … })。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, dirname, resolve } from 'node:path';
import ts from 'typescript';

const CJK = /[一-鿿　-〿＀-￯]/;
const args = process.argv.slice(2);
const keysOnly = args[0] === '--keys';
const files = keysOnly ? args.slice(1) : args;
const I18N = resolve(process.env.I18N_TARGET ?? 'src/i18n/index.ts');
const allKeys = new Set<string>();

function skip(node: ts.Node): boolean {
  const p = node.parent;
  if (!p) return true;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p)) return true;
  if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(p.operatorToken.kind)) return true;
  if (ts.isCaseClause(p)) return true;
  // 程式內部的錯誤訊息不翻
  if (ts.isNewExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 'Error') return true;
  if (ts.isPropertyAssignment(p) && p.name === node) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 'tr') return true;
  // .includes('…') 之類的比對
  if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && ['includes', 'startsWith', 'endsWith', 'indexOf'].includes(p.expression.name.text)) return true;
  return false;
}

for (const f of files) {
  const src = readFileSync(f, 'utf-8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true);
  const edits: { start: number; end: number; text: string }[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && CJK.test(node.text) && !skip(node)) {
      allKeys.add(node.text);
      edits.push({ start: node.getStart(sf), end: node.getEnd(), text: `tr(${JSON.stringify(node.text)})` });
      return;
    }
    if (ts.isTemplateExpression(node) && CJK.test(node.getText(sf)) && !skip(node)) {
      let key = node.head.text;
      const vars: string[] = [];
      node.templateSpans.forEach((span, i) => {
        key += `{${i}}` + span.literal.text;
        vars.push(`${i}: ${span.expression.getText(sf)}`);
      });
      allKeys.add(key);
      edits.push({ start: node.getStart(sf), end: node.getEnd(), text: `tr(${JSON.stringify(key)}, { ${vars.join(', ')} })` });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (keysOnly || edits.length === 0) continue;
  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (!/import \{[^}]*\btr\b[^}]*\} from '[^']*i18n(\/lang)?'/.test(out)) {
    let rel = relative(dirname(resolve(f)), I18N).replace(/\\/g, '/').replace(/\/index\.ts$/, '').replace(/\.ts$/, '');
    if (!rel.startsWith('.')) rel = './' + rel;
    // 放在第一個 import 前面（檔頭註解之後）
    const firstImport = out.search(/^import /m);
    const line = `import { tr } from '${rel}';\n`;
    out = firstImport >= 0 ? out.slice(0, firstImport) + line + out.slice(firstImport) : line + out;
  }
  writeFileSync(f, out);
  console.error(`${f}: ${edits.length}`);
}
if (keysOnly) writeFileSync(process.env.KEYS_OUT ?? 'i18n-keys.json', JSON.stringify([...allKeys].sort(), null, 1));
