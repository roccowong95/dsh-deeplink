import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
test('shipped module-loader client registers expected services and lifecycle effect',async()=>{
 let module;
 runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{location:{protocol:'dsh-app:',hostname:'app'},dshDesktop:{protocolVersion:1,deviceInfo(){}},__ModuleLoader__:{load:value=>module=value}}});
 assert.equal(module.id,'dsh-deeplink');const plugin=module.factory();
 assert.equal(plugin.name,'deeplink-client');assert.deepEqual([...plugin.inject],['connection','sessions','workspaces','uiWorkspace','layout']);
 let effect;plugin.apply({effect:value=>effect=value});assert.equal(typeof effect,'function');
});

test('ordinary browser client never polls the queue',async()=>{let module;runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{location:{protocol:'https:',hostname:'localhost'},__ModuleLoader__:{load:value=>module=value}}});module.factory().apply({effect(){throw new Error('browser must not consume links')}});});
