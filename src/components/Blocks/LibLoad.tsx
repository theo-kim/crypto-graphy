import * as t from 'io-ts';
import gen, { RandomSeed } from 'random-seed';
import aesjs from 'aes-js';

import Module from '../../../lib/build/lib';
import { extend } from 'immutability-helper';

// Generator states
let generators : { gen: {[seed : number]: RandomSeed} } = { gen : {} };

// Library
type IResolver = (lib : IModule, args : (number | string | Uint8Array)[]) => (number | string | Uint8Array)[]

type ptr = any;

interface IModule {
    ccall : (func: string, retType: string, argTypes: string[], args: any[]) => any;
    _malloc: (size: number) => ptr;
    _free: (size: ptr) => void;
    HEAPU8: Uint8Array;
};

const RIPort = t.interface({
    side: t.string,
    position: t.number,
    format: t.string,
    size: t.union([t.number, t.undefined, t.string]),
    runtimeSize: t.union([t.number, t.undefined]),
    label: t.string,
    default: t.number,
});

interface IPort {
    side: string,
    position: number,
    format: string,
    size?: number | string,
    runtimeSize?: number,
    label?: string,
    default?: number,
    required?: boolean,
};

const RIBlockLibrary = t.interface({
    operation: t.string,
    description: t.string,
    label: t.string,
    format: t.interface({
        size: t.array(t.number),
        inputs: t.array(RIPort),
        outputs: t.array(RIPort),
    })
});

interface RIBlock {
    resolver: IResolver;
    operation: string;
    description: string;
    label: string;
    format: {
        size: number[];
        inputs: IPort[],
        outputs: IPort[],
    };
};

interface ILibCall {
    packageName : string;
    functionName : string;
    args : (number | ILibCall)[];
}

interface ILibInput extends IPort {
    value: number | string | Uint8Array;
}

// Functions
const Lib = Module() as Promise<IModule>;

function GetRuntime() : Promise<IModule> {
    return Lib;
}

let matchAll = function(s : string, re : RegExp) : string[][] {
    let output : string[][] = [];
    let matches = re.exec(s);
    while (matches != null) {
        output.push(matches);
        s = s.substr(matches.index + matches[0].length);
        matches = re.exec(s);
    }

    return output;
}

function ParseLibCall (op : string) : ILibCall {
    let re = /^\s*(\w+)\s*\((.*)\)/g;
    let argsRE = /([a-zA-Z0-9._]+(?:\([a-zA-Z0-9,.\ ()]*\)))|([0-9]+)/;
    
    let tokenized : string[] = op.split(".");
    let packageName : string = tokenized[0];
    tokenized = re.exec(tokenized.slice(1).join("."));
    let functionName : string = tokenized[1];

    let call : ILibCall = {
        packageName,
        functionName,
        args: []
    }

    let args = matchAll(tokenized[2], argsRE);
    
    args.forEach((match : string[]) => {
        if (match[2] !== undefined) {
            call.args.push(parseInt(match[2]));
        }
        else {
            call.args.push(ParseLibCall(match[1]));
        }
        call.args.push();
    });

    return call;
}

function CalculateRuntimeSize(inputs : ILibInput[], outputs : ILibInput[]) {
    inputs.forEach(input => {
        if (typeof input.value === "number") {
            input.runtimeSize = 4;
        }
        else if (input.size === undefined && input.value !== undefined) {
            input.runtimeSize = (input.value as (string | Uint8Array)).length;
        }
        else if (typeof input.size === "number" && input.size > 0) {
            input.runtimeSize = input.size as number;
        }
        else if (typeof input.size === "string" && input.size === "max") {
            if (input.value !== undefined)
                input.runtimeSize = (input.value as (string | Uint8Array)).length;
            else
                input.runtimeSize = -1;
            
            inputs.forEach((oi, index) => {
                let s : number;
                if (oi.runtimeSize !== undefined) s = oi.runtimeSize;
                else {
                    if (typeof oi.value === "number") {
                        input.runtimeSize = 4;
                        s = -1;
                    }
                    else if ((oi.size === undefined || oi.size === "max") && oi.value !== undefined) {
                        s = (inputs[index].value as (string | Uint8Array)).length;
                    }
                    else if (typeof oi.size === "number") {
                        s = oi.size as number;
                    }
                    else {
                        throw "InputSizeException";
                    }
                }
                input.runtimeSize = Math.max(input.runtimeSize, s);
            });

            if (input.runtimeSize < 0) throw "MaxOfIntegersNotAllowedException";
        }
        else {
            throw "InputSizeException";
        }
    });
    outputs.forEach(output => {
        if (typeof output.size === "number" && output.size > 0) {
            output.runtimeSize = output.size as number;
        }
        else if (output.format == "number") {
            output.runtimeSize = 4;
        }
        else if (output.size === undefined || typeof output.size === "string" && output.size === "max") {
            output.runtimeSize = -1;
            
            inputs.forEach((oi, index) => {
                if (oi.format !== "number") {
                    output.runtimeSize = Math.max(output.runtimeSize, oi.runtimeSize);
                }
            });

            if (output.runtimeSize < 0) {
                throw "OutputMaxOfIntegersNotAllowedException"
            }
        }
        else {
            throw "OutputSizeException";
        }
    });
}

function ResetRuntimeSize(inputs : IPort[], outputs : IPort[]) {
    inputs.forEach(i => i.runtimeSize = undefined);
    outputs.forEach(i => i.runtimeSize = undefined);
}

function PrepareInputs(lib : IModule, index: number, inputs : IPort[], values : (number | string | Uint8Array)[]) : [string, (number | ptr)] {
    let input : IPort = inputs[index];
    let value = values[index];
    // Inheritted type, just pass value directly
    if (input.format == "inherit" && typeof value == "number") {
        return ["number", value]; 
    }
    else if (input.format == "number" && typeof value !== "number") {
        throw "TypeMismatchException";
    }
    else if (input.format == "number") {
        return ["number", value];       
    }
    if (input.format == "bytearr" && (typeof value !== "number" && typeof value !== "string" && value.constructor !== Uint8Array)) {
        throw "TypeMismatchException";
    }
    // Convert number into little endian
    else if (input.format == "bytearr" && typeof value === "number") {
        let p : ptr = lib._malloc(4); // size of an integer
        let v : Uint8Array = ConvertToArray(value);
        lib.HEAPU8.set(v, p);
        return ["ptr", p];
    }
    // Convert into a byte arr
    else if (input.format == "bytearr" || input.format == "inherit") {
        let size : number = input.runtimeSize;
        let p : ptr = lib._malloc(size);
        let v : Uint8Array;
        if (typeof value === "string") {
            v = ConvertToArray(value);
        }
        else {
            v = value as Uint8Array;
        }
        // Extend the byte array to match the length
        if (v.length < input.runtimeSize) {
            let extend = new Uint8Array(Math.abs(input.runtimeSize - v.length));
            let padded = new Uint8Array(input.runtimeSize);
            padded.set(extend);
            padded.set(v, extend.length);
            v = padded;
        }
        lib.HEAPU8.set(v, p);
        return ["ptr", p];
    }
    throw "PrepareInputsException";
}

function ConvertToArray(scalar : (string | number | Uint8Array), size?: number) : Uint8Array {
    let v = new Uint8Array(size);
    let o : Uint8Array;
    if (scalar.constructor === Uint8Array) {
        o = scalar as Uint8Array;
    }
    else if (typeof scalar === "number") {   
        let byteConversion : string = ("00000000" + scalar.toString(16)).substr(-8);
        let vector : number[] = [];
        for (let i = 0; i < byteConversion.length; i += 2) {
            vector.push(parseInt(byteConversion.substr(i, 2), 16));
        }
        o = new Uint8Array(vector);
    }
    else {
        let vector : number[] = []
        for (let i = 0; i < (scalar as string).length; ++i) {
            vector.push((scalar as string).charCodeAt(i));
        }
        o = new Uint8Array(vector);
    }
    if (size != undefined) {
        if (v.length > o.length) {
            let extend = new Uint8Array(v.length - o.length);
            v.set(extend);
            v.set(o, extend.length);
        }
        return v;
    }
    return o;
}

function ConvertToNumber(arr : Uint8Array | string | number) : number {
    if (typeof arr === "number") {
        return arr;
    }
    else if (typeof arr === "string") {
        arr = ConvertToArray(arr);
    }
    let hex : string = "";
    arr.subarray(Math.max(arr.length - 4, 0), arr.length).forEach((d) => {
        hex += ("0" + d.toString(16)).substr(-2);
    });
    hex = ("00000000" + hex).substr(-8);
    return parseInt(hex, 16);
}

let utilFunctions : { [name: string] : (args : (Uint8Array | string | number)[]) => number }= {
    len: (arr : (Uint8Array | string | number)[]) : number => { return (typeof arr[0] === "number" ? 4 : arr[0].length); },
    assign: (arr : (Uint8Array | string | number)[]) : number => { arr[1] = arr[0]; return 1; },
    asNumber: (arr : (Uint8Array | string | number)[]) : number => { arr[1] = ConvertToNumber(arr[0]); return 1; },
    asArray: (arr : (Uint8Array | string | number)[]) : number => { arr[1] = ConvertToArray(arr[0]); return 1; },
    ADD: (arr : number[]) : number => arr[0] + arr[1],
    SUB: (arr : number[]) : number => arr[0] - arr[1],
    DIV: (arr : number[]) : number => Math.floor(arr[0] / arr[1]),
    MUL: (arr : number[]) : number => arr[0] * arr[1],
    MOD: (arr : number[]) : number => arr[0] % arr[1],
    meminit: (arr : any[]) : number => { arr[0] = new Uint8Array(arr[1] as number); return arr[1]; },
    seq: (arr: any[]) : number => { return 1; },
    PRG: (arr : number[]) : number => {
        if (typeof arr[0] == "number") {
            // if the generator has not been seeded
            if (Object.keys(generators.gen).indexOf(arr[0].toString()) < 0) {
                generators.gen[arr[0]] = gen.create(arr[0].toString());
            }
            return generators.gen[arr[0]](256);
        }
    },
    PRF: (arr : any[]) : number => {
        let k : Uint8Array;
        if (typeof arr[0] == "string" || typeof arr[0] == "number") k = ConvertToArray(arr[0]);
        else k = (arr[0] as Uint8Array);
        let g = gen.create(arr[1].toString()); // create g1
        let kLen : number = k.length * 8;
        let G : number = 0;
        for (let i = 0; i < kLen; ++i) {
            G = g(0xffff);
            if (((k[Math.floor(i / 8)] >> (i % 8)) & 0x01) == 0x01) {
                G = (G >> 8) & 0xFF;
                g = gen.create(G.toString());
            }
            else {
                G = G & 0xFF;
                g = gen.create(G.toString());
            }
        }
        return G;
    },
    // PRP: (arr : any[]) : number => {
    //     let R : Uint8Array;
    //     let L : Uint8Array;

    //     if (typeof arr[0] == "string" || typeof arr[0] == "number") R = ConvertToArray(arr[0]);
    //     else R = arr[0];
    //     if (typeof arr[1] == "string" || typeof arr[1] == "number") L = ConvertToArray(arr[1]);
    //     else L = arr[1];

    //     if (R.length != L.length) {
    //         let Lfill = new Uint8Array(Math.max(0, R.length - L.length));
    //         let Rfill = new Uint8Array(Math.max(0, L.length - R.length));

    //         let Rp = new Uint8Array(Math.max(R.length, L.length));
    //         let Lp = new Uint8Array(Math.max(R.length, L.length));

    //         Rp.set(R, Rp.length - R.length);
    //         Rp.set(Rfill);

    //         Lp.set(L, Lp.length - L.length);
    //         Lp.set(Lfill);
    //     }

    //     console.log(Rp);
    //     console.log(Lp);

    //     R = Rp;
    //     L = Lp;

    //     arr[2] = L;
    //     arr[3] = R;

    //     return 1;
    // },
    aes_cbc_encrypt : (arr : any[]) : number => {
        let iv : number[] = [...ConvertToArray(arr[2], 16).subarray(0, 16)];
        let key : number[] = [...ConvertToArray(arr[1], 16).subarray(0, 16)];

        let plaintext = ConvertToArray(arr[0]);
        if (plaintext.length % 16 != 0) {
            let plaintext_save = plaintext;
            let diff = (16 - (plaintext.length % 16));
            plaintext = new Uint8Array(plaintext.length + diff);
            plaintext.fill(0, 0, diff);
            plaintext.set(plaintext_save, diff);
        }

        let aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);
        let encryptedBytes = aesCbc.encrypt(plaintext);

        arr[3] = encryptedBytes;
        return encryptedBytes.length;
    },
    aes_cbc_decrypt : (arr : any[]) : number => {
        let iv : number[] = [...ConvertToArray(arr[2], 16).subarray(0, 16)];
        let key : number[] = [...ConvertToArray(arr[1], 16).subarray(0, 16)];
        
        let ciphertext = ConvertToArray(arr[0]);
        
        let aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);
        let decryptedBytes = aesCbc.decrypt(ciphertext);

        arr[3] = decryptedBytes;
        return decryptedBytes.length;
    },
    aes_ctr_encrypt : (arr : any[]) : number => {
        let key : number[] = [...ConvertToArray(arr[1], 16).subarray(0, 16)];

        let plaintext = ConvertToArray(arr[0]);

        console.log(plaintext);

        let aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(0));
        let encryptedBytes = aesCtr.encrypt(plaintext);

        console.log(encryptedBytes);

        arr[2] = encryptedBytes;
        return encryptedBytes.length;
    },
    aes_ctr_decrypt : (arr : any[]) : number => {
        let key : number[] = [...ConvertToArray(arr[1], 16).subarray(0, 16)];
        
        let ciphertext = ConvertToArray(arr[0]);
        
        let aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(0));
        let decryptedBytes = aesCtr.decrypt(ciphertext);

        arr[2] = decryptedBytes;
        return decryptedBytes.length;
    },
    egcd : (arr : any[]) : number => {
        let gcd = eGCD(arr[0], arr[1]);
        arr[2] = gcd[0];
        arr[3] = gcd[1];
        arr[4] = gcd[2];
        return arr[2];
    }
}

function eGCD (a : number, b : number) : [ number, number, number ] {
    if (a == 0)
        return [b, 0, 1]
    else {
        let g = eGCD(b % a, a);
        let gcd = g[0];
        let x = g[1];
        let y = g[2];
        return [ gcd, y - Math.floor(b / a) * x, x ]
    }
}

function CallLibFunction (lib : IModule, libCall : ILibCall, inputs: ILibInput[], outputs: ILibInput[]) : number {
    let libInputs : (number | ptr)[] = [];
    let libInputTypes : string[] = [];
    let freeLater : ptr[] = [];
    let saveLater : { type: string, index: number, val : ptr, format?: string }[] = [];

    let values = inputs.map(input => input.value);

    libCall.args.forEach((arg : (number | ILibCall)) => {
        if (typeof arg == "number") {
            // If the arg is an input
            if (arg as number < inputs.length) {
                // If it is a util function, push actual value
                if (libCall.packageName == "util") {
                    libInputs.push(inputs[arg as number].value);
                }
                // otherwise prepare pointer
                else {
                    let input = PrepareInputs(lib, arg as number, inputs, values);
                    libInputs.push(input[1]);
                    if (input[0] == "ptr") {
                        freeLater.push(input[1]);
                    }
                    libInputTypes.push("number");
                }
            }
            else if (arg as number - inputs.length < outputs.length) {
                let outputIndex : number =  arg as number - inputs.length;
                if (libCall.packageName == "util") {
                    if (outputs[outputIndex].value == undefined) {
                        libInputs.push(null);
                    }
                    else {
                        libInputs.push(outputs[outputIndex]);
                    }
                }
                else if (outputs[outputIndex].value == undefined && outputs[outputIndex].format == "bytearr") {
                    let size : number = outputs[outputIndex].runtimeSize;

                    let p : ptr = lib._malloc(size);
                    
                    libInputs.push(p);
                    libInputTypes.push("number");
                    freeLater.push(p);
                    saveLater.push({type: "output", index: outputIndex, val: p});
                }
                else if (outputs[outputIndex].value === undefined && outputs[outputIndex].format == "number") {
                    throw "OutputValueException";
                }
                else if (outputs[outputIndex].value == undefined) {
                    let inputIndex = parseInt(outputs[outputIndex].format);
                    let size : number = inputs[inputIndex].runtimeSize;

                    let p : ptr = lib._malloc(size);
                    
                    libInputs.push(p);
                    libInputTypes.push("number");
                    freeLater.push(p);

                    if (inputs[inputIndex].format == "number") {
                        saveLater.push({type: "output", index: outputIndex, format: "number", val: p});
                    }
                    else {
                        saveLater.push({type: "output", index: outputIndex, val: p});
                    }
                }
                else if (outputs[outputIndex].value.constructor === Uint8Array) {
                    let arr : Uint8Array = outputs[outputIndex].value as Uint8Array;
                    let p : ptr = lib._malloc(arr.length);
                    lib.HEAPU8.set(arr, p);

                    libInputs.push(p);
                    libInputTypes.push("number");
                    freeLater.push(p);
                }
                else {
                    libInputs.push(outputs[outputIndex].value);
                }
            }
            else {
                throw "IndexException";
            }
        }
        else {
            libInputs.push(CallLibFunction(lib, arg as ILibCall, inputs, outputs));
            libInputTypes.push("number");
        }
    });
    let ret = 0;
    if (libCall.packageName == "util") {
        ret = utilFunctions[libCall.functionName](libInputs);
        libInputs.forEach((v, i) => { 
            if (typeof libCall.args[i] == "number") {
                if (libCall.args[i] >= inputs.length) {
                    if (typeof v == "number") outputs[libCall.args[i] as number - inputs.length].runtimeSize = 4;
                    else outputs[libCall.args[i] as number - inputs.length].runtimeSize = v.length;
                    outputs[libCall.args[i] as number - inputs.length].value = v;
                }
                else {
                    inputs[libCall.args[i] as number].value = v;
                }
            }
            // else {
            //     outputs[libCall.args[i] as number - inputs.length].value = v;
            //     outputs[libCall.args[i] as number - inputs.length].runtimeSize = v.length;
            // }
        })
    }
    else {
        // library call
        ret = lib.ccall(libCall.functionName, "number", libInputTypes, libInputs);
    }
    saveLater.forEach((value : { type: string, index: number, val : ptr, format?: string }) => {
        if (value.format === undefined || value.format === "bytearr") {
            if (value.type == "input") {
                inputs[value.index].value = new Uint8Array(lib.HEAPU8.buffer, value.val, inputs[value.index].runtimeSize);
            }
            else {
                outputs[value.index].value = new Uint8Array(lib.HEAPU8.buffer, value.val, outputs[value.index].runtimeSize);
            }
        }
        else {
            if (value.type == "input") {
                inputs[value.index].value = ConvertToNumber(new Uint8Array(lib.HEAPU8.buffer, value.val, inputs[value.index].runtimeSize));
            }
            else {
                outputs[value.index].value = ConvertToNumber(new Uint8Array(lib.HEAPU8.buffer, value.val, outputs[value.index].runtimeSize));
            }
        }
    });
    freeLater.forEach((value : ptr) => lib._free(value));

    return ret;
}

export  { 
            RIBlockLibrary, RIBlock, IPort, RIPort, 
            IModule, IResolver, ILibCall, ILibInput, 
            ptr, generators,
            CalculateRuntimeSize, ResetRuntimeSize,
            GetRuntime, CallLibFunction, ParseLibCall,
            ConvertToArray, ConvertToNumber
        }