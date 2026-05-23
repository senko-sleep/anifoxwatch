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

// Get both source files
const watchhentaiSf = prog.getSourceFiles().find(f => f.fileName.includes('watchhentai-source.ts'));
const baseSf = prog.getSourceFiles().find(f => f.fileName.includes('base-source.ts'));

// Get module symbols
const watchSym = checker.getSymbolAtLocation(watchhentaiSf);
const baseSym = checker.getSymbolAtLocation(baseSf);

console.log('Watchhentai module (self):', watchSym?.name ?? 'none');
console.log('Base module:', baseSym?.name ?? 'none');

// Get exported symbols from base module
function getAllExports(sym, prefix = '') {
  if (!sym) return [];
  let result = [];
  if (sym.exports) {
    sym.exports.forEach((e, key) => {
      result.push(prefix + key);
      result.push(...getAllExports(e, prefix + key + '.'));
    });
  }
  return result;
}

console.log('\nAll exports of base module:');
console.log(getAllExports(baseSym).join('\n '));

// Find GenreAwareSource in base source file
function findDecl(sf, name) {
  let result = null;
  ts.forEachChild(sf, n => {
    if (ts.isInterfaceDeclaration(n) && n.name.getText(sf) === name) {
      result = n;
    }
  });
  return result;
}

const genreDecl = findDecl(baseSf, 'GenreAwareSource');
const baseDecl = findDecl(baseSf, 'BaseAnimeSource');

if (genreDecl) {
  const genreSym = checker.getSymbolAtLocation(genreDecl.name);
  console.log('\nGenreAwareSource symbol flags:', genreSym?.flags, 'name:', genreSym?.name);
  console.log('  Parent:', genreSym?.parent?.name);
  console.log('  Is exported (SymbolFlags.Export):', !!(genreSym?.flags & ts.SymbolFlags.Export));
  console.log('  Is property:', !!(genreSym?.flags & ts.SymbolFlags.Property));
}

if (baseDecl) {
  const baseClassDecl = baseSf.statements.filter(s => ts.isClassDeclaration(s)).find(c => c.name?.getText(baseSf) === 'BaseAnimeSource');
  if (baseClassDecl) {
    const baseSym = checker.getSymbolAtLocation(baseClassDecl.name);
    console.log('\nBaseAnimeSource symbol flags:', baseSym?.flags, 'name:', baseSym?.name);
    console.log('  Parent:', baseSym?.parent?.name);
    console.log('  Is exported:', !!(baseSym?.flags & ts.SymbolFlags.Export));
    console.log('  Is property:', !!(baseSym?.flags & ts.SymbolFlags.Property));
  }
}
