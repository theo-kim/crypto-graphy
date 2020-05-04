import * as t from 'io-ts';
import aesjs, { ModeOfOperation } from 'aes-js';

import Module from '../../../lib/build/lib';
import { extend } from 'immutability-helper';
import { RAND_byte, generators, PRGn, PRF, PRP, } from '../../runtime/random';

// Generator states

// Library
type IResolver = (lib : IModule, args : (number | string | Uint8Array)[], reporter: (msg: string) => void) => (number | string | Uint8Array)[]

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
        if (typeof input.value === "number" && input.format == "number") {
            input.runtimeSize = 4;
        }
        else if (input.size === undefined && input.value !== undefined && (typeof input.value === "string" || input.constructor == Uint8Array)) {
            input.runtimeSize = (input.value as (string | Uint8Array)).length;
        }
        else if (typeof input.size === "number" && input.size > 0) {
            input.runtimeSize = input.size as number;
        }
        else if (input.size === undefined || (typeof input.size === "string" && input.size === "max")) {
            if (typeof input.value === "number")
                input.runtimeSize = 4;
            else if (input.value !== undefined)
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
        else if (typeof output.size === "string" && output.size !== undefined && (output.size as string)[0] == "i") {
            let inputIndex : number = parseInt((output.size as string)[1]);
            if (isNaN(inputIndex)) {
                throw "NaNOutputRuntimeSizeDefinition";
            }
            if (inputIndex > inputs.length) {
                throw "OutOfBoundsOutputRuntimeSizeAssignment";
            }
            output.runtimeSize = inputs[inputIndex].runtimeSize;
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

function PrepareInputs(lib : IModule, index: number, inputs : IPort[], values : (number | string | Uint8Array)[], reporter: (msg: string) => void) : [string, (number | ptr)] {
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
        reporter("[WARNING] Your number was automatically converted into a byte array.");
        let p : ptr;
        let v : Uint8Array
        if (4 < input.runtimeSize) {
            reporter("[WARNING] A number is four bytes long and was given to a port that requires a size of " + input.runtimeSize + ". It was automatically padded with zeros to meet the correct length requirement, consider padding it yourself.");
        }
        p = lib._malloc(input.runtimeSize); // size of an integer
        v = ConvertToArray(value, input.runtimeSize);
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
            reporter("[WARNING] An array of size " + v.length + " was given to a port that requires a size of " + input.runtimeSize + ". It was automatically padded with zeros to meet the correct length requirement, consider padding it yourself.");
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

let utilFunctions : { [name: string] : (args : (Uint8Array | string | number)[], reporter?: (msg: string) => void) => number }= {
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
    PRG: (arr : any[]) : number => {
        let seed : Uint8Array = ConvertToArray(arr[0]);
        let size : number = arr[1];
        arr[2] = PRGn(seed, size);
        return 0;
    },
    PRF: (arr : any[]) : number => {
        let k : Uint8Array = ConvertToArray(arr[0]);
        let seed : Uint8Array = ConvertToArray(arr[1]);
        let size : number = arr[2];
        arr[3] = PRF(seed, k, size);

        return size;
    },
    PRP: (arr : any[]) : number => {
        let R : Uint8Array, L : Uint8Array, RL: Uint8Array;
        let seed : Uint8Array = ConvertToArray(arr[1]);

        RL = ConvertToArray(arr[0]);
        
        L = RL.subarray(0, Math.ceil(RL.length / 2));
        R = RL.subarray(Math.floor(RL.length / 2), RL.length);

        if (RL.length % 2 != 0) { // If odd, split the middle byte
            L[L.length - 1] = L[L.length - 1] && 0b11110000;
            R[0] = R[0] && 0b00001111;
        }

        let LR = PRP(seed, L, R);

        let r = new Uint8Array(RL.length);
        
        if (RL.length % 2 != 0) { // If odd, join the middle byte
            r.set(LR[0]);
            r.set(LR[1], LR[0].length - 1);
            r[LR[0].length - 1] = (LR[0][LR[0].length - 1] && 0b11110000) || (LR[1][0] && 0b00001111);
        }
        else {
            r.set(LR[0]);
            r.set(LR[1], LR[0].length);
        }

        arr[2] = r;

        return 1;
    },
    randbyte: (arr: any[]) : number => {
        return RAND_byte();
    },
    prepare_cbc : (arr : any[], reporter) : number => {
        if (typeof arr[1] === "number" || arr[1].length < 16)
            reporter("[WARNING] Your AES key is not 16 bytes long, so it was automatically padded with zeros to meet the correct length requirement, consider using a 16 byte key.");
        if (typeof arr[0] === "number" || arr[0].length < 16)
            reporter("[WARNING] Your AES initialization vector is not 16 bytes long, so it was automatically padded with zeros to meet the correct length requirement, consider using a 16 byte initialization vector.");

        let iv : number[] = [...ConvertToArray(arr[0], 16).subarray(0, 16)];
        let key : number[] = [...ConvertToArray(arr[1], 16).subarray(0, 16)];

        let aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);

        arr[2] = aesCbc;
        return 1;
    },
    prepare_ctr : (arr : any[], reporter) : number => {
        if (typeof arr[1] === "number" || arr[1].length < 16)
            reporter("[WARNING] Your AES key is not 16 bytes long, so it was automatically padded with zeros to meet the correct length requirement, consider using a 16 byte key.");
        let key : number[] = [...ConvertToArray(arr[1], 16).subarray(0, 16)];
        let counter : number = arr[0];
        
        let aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(counter));

        arr[2] = aesCtr;
        return 0;
    },
    prepare_ecb : (arr : any[], reporter) : number => {
        if (typeof arr[0] === "number" || arr[0].length < 16)
            reporter("[WARNING] Your AES key is not 16 bytes long, so it was automatically padded with zeros to meet the correct length requirement, consider using a 16 byte key.");
        let key : number[] = [...ConvertToArray(arr[0], 16).subarray(0, 16)];
        
        let aesEcb = new aesjs.ModeOfOperation.ecb(key);

        arr[1] = aesEcb;
        return 0;
    },
    aes_encrypt : (arr : any[], reporter) : number => {
        let mode : (
            ModeOfOperation.ModeOfOperationCBC |
            ModeOfOperation.ModeOfOperationCTR |
            ModeOfOperation.ModeOfOperationECB |
            ModeOfOperation.ModeOfOperationOFB ) = arr[1];
        
        let plaintext : Uint8Array;
        let raw = arr[0];

        if (mode.constructor == ModeOfOperation.ctr) 
            plaintext = ConvertToArray(arr[0]);
        else if (typeof raw === "number" || (raw.length % 16) !== 0) {
            reporter("[WARNING] Your AES plaintext length is not divisible by 16 bytes, it will be padded with zeros to meet the requirement, but the decrypted value will not match the encrypted value, consider padding it yourself and un-padding it after decryption.");
            if (typeof raw == "number") raw = ConvertToArray(raw);
            let diff = (16 - (raw.length % 16));
            plaintext = ConvertToArray(raw, raw.length + diff);
        }

        // let aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(0));
        let encryptedBytes =  mode.encrypt(plaintext);;

        arr[2] = encryptedBytes;
        return encryptedBytes.length;
    },
    aes_decrypt : (arr : any[]) : number => {
        let mode : (
            ModeOfOperation.ModeOfOperationCBC |
            ModeOfOperation.ModeOfOperationCTR |
            ModeOfOperation.ModeOfOperationECB |
            ModeOfOperation.ModeOfOperationOFB ) = arr[1];
        
        let ciphertext = ConvertToArray(arr[0]);

        // let aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(0));
        let decryptedBytes =  mode.decrypt(ciphertext);

        console.log(decryptedBytes);

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

function CallLibFunction (lib : IModule, libCall : ILibCall, inputs: ILibInput[], outputs: ILibInput[], reporter: (msg: string) => void) : number {
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
                    let input = PrepareInputs(lib, arg as number, inputs, values, reporter);
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
            libInputs.push(CallLibFunction(lib, arg as ILibCall, inputs, outputs, reporter));
            libInputTypes.push("number");
        }
    });
    let ret = 0;
    if (libCall.packageName == "util") {
        // Call built in function
        ret = utilFunctions[libCall.functionName](libInputs, reporter);
        // Recover values
        libInputs.forEach((v, i) => { 
            if (typeof libCall.args[i] == "number") {
                if (libCall.args[i] >= inputs.length) {
                    if (typeof v == "number") outputs[libCall.args[i] as number - inputs.length].runtimeSize = 4;
                    else if (typeof v == "string" || v.constructor == Uint8Array) outputs[libCall.args[i] as number - inputs.length].runtimeSize = v.length;
                    else outputs[libCall.args[i] as number - inputs.length].runtimeSize = 1;
                    outputs[libCall.args[i] as number - inputs.length].value = v;
                }
                else {
                    inputs[libCall.args[i] as number].value = v;
                }
            }
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
            ptr,
            CalculateRuntimeSize, ResetRuntimeSize,
            GetRuntime, CallLibFunction, ParseLibCall,
            ConvertToArray, ConvertToNumber
        }