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

// Print source text around the class
const classStart = sf.getText().indexOf('class WatchHentaiSource');
console.log('Source around class:', JSON.stringify(sf.getText().substring(classStart, classStart + 80)));

// Check heritage clauses
ts.forEachChild(sf, child => {
  if (ts.isClassDeclaration(child)) {
    console.log('\\n=== Heritage Clauses ===');
    let hcNum = 0;
    for (const hc of child.heritageClauses!) {
      console.log(`\\nHC[${hcNum}] token=${ts.SyntaxKind[hc.token]} pos=${hc.pos} end=${hc.end}`);
      console.log('  text:', JSON.stringify(hc.getText(sf)));
      hcNum++;
      
      ts.forEachChild(hc, sub => {
        console.log('  Sub expr:', JSON.stringify(sub.getText(sf)), 'kind:', ts.SyntaxKind[sub.kind]);
        const expr = sub.expression;
        if (expr && ts.isIdentifier(expr)) {
          const sym = checker.getSymbolAtLocation(expr);
          if (sym) {
            console.log('  Resolved symbol:', sym.name, 'from:');
            sym.declarations?.forEach(d => {
              console.log('    ', d.getSourceFile().fileName, 'pos:', d.pos);
            });
            console.log('  Flags:', sym.flags);
            console.log('  Value Declaration:', sym.valueDeclaration?.pos);
          } else {
            console.log('  *** NOT RESOLVED ***');
            // Try checker.resolveExternalModuleSymbol
            const unresolvedDiags = program.getSemanticDiagnostics(sf).filter(
              d => d.code === 2304 || d.messageText?.includes('GenreAwareSource')
            );
            console.log('  Semantic diags count:', unresolvedDiags.length);
          }
        }
      });
    }
  }
});

// Try to find the 'implements' token in the global scope
const importedFiles = Object.fromEntries(
  program.getSourceFiles().map(f => [f.fileName, f.fileName])
);
console.log('\\nFiles in program:');
for (const f of program.getSourceFiles()) {
  if (f.fileName.includes('base-source') || f.fileName.includes('watchhentai')) {
    console.log(' ', f.fileName);
  }
}
// Check if base-source module symbol is available
const baseSourceSf = program.getSourceFiles().find(f => f.fileName.includes('base-source.ts'));
if (baseSourceSf) {
  const baseSym = checker.getSymbolAtLocation(baseSourceSf);
  console.log('\\nbase-source.ts module symbol:', baseSym?.name, 'exports:',
    checker.getExportsOfModule(baseSym)?.map(e => e.name));
}
