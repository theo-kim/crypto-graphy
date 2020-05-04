import gen, { RandomSeed } from 'random-seed';

import { XOR, AND, NOT, OR } from './bitwise';

let generators : { gen: {[seed : string]: RandomSeed} } = { gen : {} };

// Returns byte representation of a double
function DoubleToBytes(f : number) : Uint8Array {
    var buf = new ArrayBuffer(8);
    (new Float64Array(buf))[0] = f;
    return new Uint8Array(buf);
}

// Returns a single, truly random byte
function RAND_byte() : number {
    const now = Date.now();
    return (now & 0xff);
}

// Returns 8 pseudo random bytes given a random seed value
function PRG(seed: Uint8Array) : Uint8Array {
    if (Object.keys(generators.gen).indexOf(seed.toString()) < 0) {
        generators.gen[seed.toString()] = gen.create(seed.toString());
    }
    return DoubleToBytes(generators.gen[seed.toString()].random());
}

// Returns 'size' pseudo random bytes given a random seed value
function PRGn(seed: Uint8Array, size: number) : Uint8Array {
    if (size <= 8) {
        return PRG(seed).subarray(0, size);
    }
    else { // Expand the sequence to the needed length
        let o : Uint8Array = new Uint8Array(size);
        for (let n = 0; n < size; n += 8) {
            o.set(PRG(seed), n);
        } 
        return o;
    }
}

// Returns 8 pseudo random bytes given a random seed value
function PRG_unstateful(seed: Uint8Array) : Uint8Array {
    let G = gen.create(seed.toString());
    return DoubleToBytes(G.random());
}

// Returns 'size' pseudo random bytes given a random seed value
function PRGn_unstateful(seed: Uint8Array, size: number) : Uint8Array {
    if (size <= 8) {
        return PRG_unstateful(seed).subarray(0, size);
    }
    else { // Expand the sequence to the needed length
        let o : Uint8Array = new Uint8Array(size);
        for (let n = 0; n < size; n += 8) {
            o.set(PRG_unstateful(seed), n);
        } 
        return o;
    }
}

// Returns a deterministic and functional random array given a seed value and k
function PRF(seed: Uint8Array, k: Uint8Array, size: number) : Uint8Array {
    let kLen : number = k.length * 8;
    let s : Uint8Array = seed;
    for (let i = 0; i < kLen; ++i) {
        s = PRGn_unstateful(s, size * 2);
        // If k[i] bit is 1, take the upper half
        if (((k[Math.floor(i / 8)] >> (i % 8)) & 0x01) == 0x01) {
            s = s.subarray(0, size);
        }
        // Else, take the upper half
        else {
            s = s.subarray(0, size);
        }
    }
    return s;
}

function PRP(seed: Uint8Array, l: Uint8Array, r: Uint8Array) : [ Uint8Array, Uint8Array ] {
    let L : Uint8Array, R : Uint8Array;
    // Deep copy
    L = new Uint8Array(l.length);
    R = new Uint8Array(r.length);
    L.set(l);
    R.set(r);
    // Perform three round Feistel Transformation
    for (let i = 0; i < 3; ++i) {
        L = R;
        R = XOR(PRF(seed, R, r.length), L);
    }
    return [ L, R ];
}

export { generators, RAND_byte, PRGn, PRF, PRP }