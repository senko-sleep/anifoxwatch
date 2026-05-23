const ts = require('typescript');
const program = ts.createProgram(['src/sources/watchhentai-source.ts'], {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  esModuleInterop: true,
  skipLibCheck: true,
  noEmit: true,
});

const sf = program.getSourceFile('src/sources/watchhentai-source.ts');
const checker = program.getTypeChecker();
const content = sf.getText();

ts.forEachChild(sf, child => {
  if (ts.isClassDeclaration(child)) {
    for (let hi = 0; hi < child.heritageClauses.length; hi++) {
      const hc = child.heritageClauses[hi];
      ts.forEachChild(hc, (sub) => {
        if (ts.isExpressionWithTypeArguments(sub)) {
          const expr = sub.expression;
          if (ts.isIdentifier(expr)) {
            const sym = checker.getSymbolAtLocation(expr);
            console.log(`HC[${hi}] ${expr.getText(sf)}: sym=${sym?.name ?? 'NONE'}`);
          }
        }
      });
    }
  }
});

console.log('Source at watchhentai:', JSON.stringify(content.indexOf('implements ')), JSON.stringify(content.indexOf('implements ') > 0 ? content.substring(content.indexOf('implements '), content.indexOf('implements ')+30) : 'not found'));
