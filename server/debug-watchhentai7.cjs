const ts = require('typescript');
const prog = ts.createProgram(['src/sources/watchhentai-source.ts', 'src/sources/base-source.ts'], {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  esModuleInterop: true,
  skipLibCheck: true,
  noEmit: true,
});
const checker = prog.getTypeChecker();
const baseSf = prog.getSourceFiles().find(f => f.fileName.includes('base-source.ts'));
const baseSym = checker.getSymbolAtLocation(baseSf);
function getAllExports(sym, prefix = '') {
  if (!sym || !sym.exports) return [];
  let result = [];
  sym.exports.forEach((e, key) => {
    result.push({ name: key, flags: e.flags, parent: e.parent?.name });
    result.push(...getAllExports(e, prefix + key + '.'));
  });
  return result;
}

console.log('All exports of base module:');
const exp = getAllExports(baseSym);
exp.forEach(e => {
  const hex = e.flags.toString(16);
  const names = [];
  if (e.flags & ts.SymbolFlags.Export) names.push('Export');
  if (e.flags & ts.SymbolFlags.Property) names.push('Property');
  if (e.flags & ts.SymbolFlags.Class) names.push('Class');
  if (e.flags & ts.SymbolFlags.Interface) names.push('Interface');
  if (e.flags & ts.SymbolFlags.Prototype) names.push('Prototype');
  if (e.flags & ts.SymbolFlags.Alias) names.push('Alias');
  console.log(e.name, 'flags:', hex, names);
});

// Check the BaseAnimeSource flags specifically
const baseClass = baseSf.statements.filter(s => ts.isClassDeclaration(s)).find(c => c.name?.getText(baseSf) === 'BaseAnimeSource');
if (baseClass) {
  const sym = checker.getSymbolAtLocation(baseClass.name);
  console.log('\nBaseAnimeSource direct symbol flags:', sym?.flags.toString(16));
}
