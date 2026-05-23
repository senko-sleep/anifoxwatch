import ts from 'typescript';
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

ts.forEachChild(sf, child => {
  if (ts.isClassDeclaration(child)) {
    for (const hc of child.heritageClauses!) {
      // Get the type arguments
      ts.forEachChild(hc, (sub, subIdx) => {
        if (ts.isExpressionWithTypeArguments(sub)) {
          const expr = sub.expression;
          console.log(`HC[${child.heritageClauses.indexOf(hc)}] sub:`, sub.getText(sf));
          
          // Get the lexically scoped symbol for this expression
          const sym = checker.getSymbolAtLocation(expr);
          console.log('  Symbol resolved:', sym?.name ?? 'NONE');
          
          if (expr.kind === ts.SyntaxKind.Identifier) {
            // Try to see what checker resolves it to
            const typeAtLocation = checker.getTypeAtLocation(expr);
            console.log('  Type:', checker.typeToString(typeAtLocation));
            console.log('  Inferred symbol:', typeAtLocation.getSymbol()?.name);
          }
        }
      });
    }
  }
});

// Zero in on the problem
const content = sf.getText();
const implementsIdx = content.indexOf('implements ');
console.log('\\nimplements at pos:', implementsIdx, ':', JSON.stringify(content.substring(implementsIdx, implementsIdx + 30)));
const baseIdx = content.indexOf('BaseAnimeSource', implementsIdx);
console.log('BaseAnimeSource at pos:', baseIdx, ':', JSON.stringify(content.substring(baseIdx, baseIdx + 20)));
