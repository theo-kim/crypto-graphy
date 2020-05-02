import * as t from 'io-ts';

import Module from '../../../lib/build/lib';

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
});

type IPort = t.TypeOf<typeof RIPort>;

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

interface RIBlock extends t.TypeOf<typeof RIBlockLibrary> {
    resolver: IResolver;
}

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
    let argsRE = /([a-zA-Z0-9.]+(?:\([a-zA-Z0-9,]*\)))|([0-9]+)/;
    
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
        if (input.size === undefined && input.value !== undefined) {
            input.runtimeSize = (input.value as (string | Uint8Array)).length;
        }
        else if (typeof input.size === "number" && input.size > 0) {
            input.runtimeSize = input.size as number;
        }
        else if (typeof input.size === "string" && input.size === "max") {
            if (input.value !== undefined)
                input.runtimeSize = (input.value as (string | Uint8Array)).length;
            else
                input.runtimeSize = 0;
            
            inputs.forEach((oi, index) => {
                let s : number;
                if (oi.runtimeSize !== undefined) s = oi.runtimeSize;
                else {
                    if ((oi.size === undefined || oi.size === "max") && oi.value !== undefined) {
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
        }
        else {
            throw "InputSizeException";
        }
    });
    outputs.forEach(output => {
        if (typeof output.size === "number" && output.size > 0) {
            output.runtimeSize = output.size as number;
        }
        else if (output.size === undefined || typeof output.size === "string" && output.size === "max") {
            output.runtimeSize = 0;
            
            inputs.forEach((oi, index) => {
                output.runtimeSize = Math.max(output.runtimeSize, oi.runtimeSize);
            });
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
    if (input.format == "number" && typeof value !== "number") {
        throw "TypeMismatchException";
    }
    else if (input.format == "number") {
        return ["number", value];       
    }
    if (input.format == "bytearr" && (typeof value !== "string" && value.constructor !== Uint8Array)) {
        throw "TypeMismatchException";
    }
    else if (input.format == "bytearr") {
        let size : number = input.runtimeSize;
        let p : ptr = lib._malloc(size);
        let byteConversion : number[] = [ ];
        let v : Uint8Array;
        if (typeof value === "string") {
            for (let i = 0; i < (value as (string | Uint8Array)).length; ++i) {
                byteConversion.push((value as string).charCodeAt(i));
            }
            v = new Uint8Array(byteConversion);
        }
        else {
            v = value as Uint8Array;
        }
        // Extend the byte array to match the length
        if (v.length != input.runtimeSize) {
            let extend = new Uint8Array(input.runtimeSize - v.length);
            extend.fill((v[0] >> 7) == 0 ? 0 : 0xff);
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

let utilFunctions : { [name: string] : (args : any[]) => number }= {
    len: (arr : (Uint8Array | string)[]) : number => { return arr[0].length; }
}

function CallLibFunction (lib : IModule, libCall : ILibCall, inputs: ILibInput[], outputs: ILibInput[]) : number {
    let libInputs : (number | ptr)[] = [];
    let libInputTypes : string[] = [];
    let freeLater : ptr[] = [];
    let saveLater : { type: string, index: number, val : ptr }[] = [];

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
                        throw "OutputUtilFunctionException";
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
                else if (outputs[outputIndex].value === undefined) {
                    throw "OutputValueException";
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
    }
    else {
        // library call
        ret = lib.ccall(libCall.functionName, null, libInputTypes, libInputs);
    }
    saveLater.forEach((value : { type: string, index: number, val : ptr }) => {
        if (value.type == "input") {
            inputs[value.index].value = new Uint8Array(lib.HEAPU8.buffer, value.val, inputs[value.index].runtimeSize);
        }
        else {
            outputs[value.index].value = new Uint8Array(lib.HEAPU8.buffer, value.val, outputs[value.index].runtimeSize);
        }
    })
    freeLater.forEach((value : ptr) => lib._free(value));

    return ret;
}

export  { 
            RIBlockLibrary, RIBlock, IPort, RIPort, 
            IModule, IResolver, ILibCall, ILibInput, 
            ptr, 
            CalculateRuntimeSize, ResetRuntimeSize,
            GetRuntime, CallLibFunction, ParseLibCall
        }