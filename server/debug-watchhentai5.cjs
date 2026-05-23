const ts = require('typescript');
const prog = ts.createProgram(['src/sources/watchhentai-source.ts'], {
  target: 1, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true, esModuleInterop: true, skipLibCheck: true, noEmit: true,
});
const checker = prog.getTypeChecker();
const baseSourceSf = prog.getSourceFiles().find(f => f.fileName.includes('base-source.ts'));
const baseSym = checker.getSymbolAtLocation(baseSourceSf);
manualSym = checker.resolveExternalModuleSymbol(baseSym, ts.createIdentifier('GenreAwareSource'));
console.log('Manual resolve GenreAwareSource:', manualSym ? manualSym.name : 'NOT RESOLVED');

const result = prog.getSemanticDiagnostics();
result.forEach(d => {
  if (d.code === 2304) {
    console.log('TS2304:', d.messageText.toString());
  }
});
