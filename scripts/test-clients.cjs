// Tests the storage adapter without a browser or a database.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'orvelium-client-tests-'));
for (const name of ['types', 'local-repository']) {
  const source = fs.readFileSync(path.join(__dirname, `../lib/clients/${name}.ts`), 'utf8');
  fs.writeFileSync(path.join(output, `${name}.js`), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText);
}
const { createLocalClientRepository, clientStorageKey } = require(path.join(output, 'local-repository.js'));
const { emptyClient, validateClient } = require(path.join(output, 'types.js'));
const records = new Map();
let failWrite = false;
global.window = { localStorage: { getItem: key => records.get(key) ?? null, setItem: (key, value) => { if (failWrite) throw new Error('quota'); records.set(key, value); } } };
const input = { ...emptyClient, name: 'Pessoa Exemplo', document: '000.000.000-00', phone: '(00) 00000-0000', email: 'cliente@example.com' };
after(() => fs.rmSync(output, { recursive: true, force: true }));
test('CRUD persists, normalizes and keeps workspaces separate', async () => {
 const repo = createLocalClientRepository('A');
 assert.deepEqual(await repo.list(), []);
 const client = await repo.create(input);
 assert.equal(client.document, '00000000000'); assert.equal(client.phone, '00000000000');
 assert.equal((await createLocalClientRepository('A').list())[0].id, client.id);
 assert.deepEqual(await createLocalClientRepository('B').list(), []);
 await assert.rejects(repo.create(input), /Já existe/);
 await repo.update(client.id, { ...input, name: 'Pessoa Editada', status: 'inactive' });
 assert.equal((await repo.list())[0].status, 'inactive');
 await repo.remove(client.id); assert.deepEqual(await repo.list(), []);
 await assert.rejects(repo.update(client.id, input), /não encontrado/);
 await assert.rejects(repo.remove(client.id), /já foi excluído/);
});
test('PJ and optional fields; invalid documents, phones, names and email', async () => {
 const repo = createLocalClientRepository('PJ');
 await repo.create({ ...emptyClient, type: 'company', name: 'Empresa Exemplo', document: '00.000.000/0000-00' });
 assert.equal((await repo.list())[0].type, 'company');
 for (const patch of [{ name: '  ' }, { document: '123' }, { phone: '123' }, { email: 'invalido' }, { state: 'XX' }]) assert.ok(validateClient({ ...input, ...patch }));
});
test('corrupt data is preserved and cannot be overwritten', async () => {
 const key = clientStorageKey('corrupt'); records.set(key, '{invalid');
 const repo = createLocalClientRepository('corrupt');
 await assert.rejects(repo.list(), /formato inválido/);
 await assert.rejects(repo.create(input), /formato inválido/);
 assert.equal(records.get(key), '{invalid');
});
test('failed write does not report success or alter existing records', async () => {
 const repo = createLocalClientRepository('quota'); await repo.create(input);
 const previous = records.get(clientStorageKey('quota'));
 failWrite = true;
 try { await assert.rejects(repo.remove((await repo.list())[0].id), /Não foi possível salvar/); }
 finally { failWrite = false; }
 assert.equal(records.get(clientStorageKey('quota')), previous);
});
test('blocked localStorage is handled without exposing raw browser errors', async () => {
 const storage = window.localStorage;
 Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
 try { await assert.rejects(createLocalClientRepository('blocked').list(), /bloqueou o armazenamento/); }
 finally { Object.defineProperty(window, 'localStorage', { configurable: true, value: storage }); }
});
