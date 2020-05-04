function XOR (l : Uint8Array, r : Uint8Array): Uint8Array {
    let s : number = Math.max(l.length, r.length);
    let o = new Uint8Array(s);
    for (let i = 0; i < s; ++i) {
        o[i] = (i < l.length ? l[l.length - i - 1] : 0) ^ (i < r.length ? r[r.length - i - 1] : 0);
    }
    return o;
}

function OR (l : Uint8Array, r : Uint8Array): Uint8Array {
    let s : number = Math.max(l.length, r.length);
    let o = new Uint8Array(s);
    for (let i = 0; i < s; ++i) {
        o[i] = (i < l.length ? l[l.length - i - 1] : 0) | (i < r.length ? r[r.length - i - 1] : 0);
    }
    return o;
}

function AND (l : Uint8Array, r : Uint8Array): Uint8Array {
    let s : number = Math.max(l.length, r.length);
    let o = new Uint8Array(s);
    for (let i = 0; i < s; ++i) {
        o[i] = (i < l.length ? l[l.length - i - 1] : 0) & (i < r.length ? r[r.length - i - 1] : 0);
    }
    return o;
}

function NOT (l : Uint8Array): Uint8Array {
    let s : number = l.length;
    let o = new Uint8Array(s);
    for (let i = 0; i < s; ++i) {
        o[i] = ~l[i];
    }
    return o;
}

export { XOR, OR, NOT, AND };