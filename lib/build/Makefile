default :
	emcc *.o -s WASM=1 -s MODULARIZE=1 -s EXPORTED_FUNCTIONS="['_MD5', '_SHA1', '_SHA256', '_XOR', '_AND', '_OR', '_NOT', '_EQ', '_DEQ', '_LSHIFT', '_RSHIFT', '_malloc', '_free']" -o lib.js -s EXTRA_EXPORTED_RUNTIME_METHODS='["ccall", "getValue", "setValue"]' && mv lib.wasm ../../dist
