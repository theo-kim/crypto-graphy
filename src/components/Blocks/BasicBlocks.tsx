import * as React from 'react';
import * as t from 'io-ts';

import blocks from '../../../lib/blocks/std.json';

import { AppBlockProps as IProps, AppBlockFactory, BlockTemplateFactory } from './AppBlock'

import Module from '../../../lib/build/lib';

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

type IResolver = (lib : IModule, args : (number | string | Uint8Array)[]) => (number | string | Uint8Array)[]

type ptr = any;

interface IModule {
    ccall : (func: string, retType: string, argTypes: string[], args: any[]) => any;
    _malloc: (size: number) => ptr;
    _free: (size: ptr) => void;
    HEAPU8: Uint8Array;
};

interface RIBlock extends t.TypeOf<typeof RIBlockLibrary> {
    resolver: IResolver;
}

interface ILoaderFunction extends RIBlock {
    packageName: string;
    blockName: string;
    constructor: Function;
}

const RIBlockLibraryFile = t.dictionary(t.string, t.dictionary(t.string, RIBlockLibrary));

type IBlockLibraryFile = t.TypeOf<typeof RIBlockLibraryFile>;
type IBlockLibrary = { [ packageName : string ] : { [ blockName : string ] : ILoaderFunction } };

interface ILibCall {
    packageName : string;
    functionName : string;
    args : (number | ILibCall)[];
}

interface ILibInput extends IPort {
    value: number | string | Uint8Array;
}

const Lib = Module() as Promise<IModule>;

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

function GetRuntime() : Promise<IModule> {
    return Lib;
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
        if (typeof value === "string") {
            for (let i = 0; i < (value as (string | Uint8Array)).length; ++i) {
                byteConversion.push((value as string).charCodeAt(i));
            }
            lib.HEAPU8.set(new Uint8Array(byteConversion), p);
        }
        else {
            lib.HEAPU8.set(value as Uint8Array, p);
        }
        return ["ptr", p];
    }
    throw "PrepareInputsException";
}

let utilFunctions : { [name: string] : (...args : any[]) => number }= {
    len: (arr : Uint8Array | string) : number => arr.length
}

function CallLibFunction (lib : IModule, libCall : ILibCall, inputs: ILibInput[], outputs: ILibInput[]) : number {
    let libInputs : (number | ptr)[] = [];
    let libInputTypes : string[] = [];
    let freeLater : ptr[] = [];
    let saveLater : { type: string, index: number, val : ptr }[] = [];

    let values = inputs.map(input => input.value);

    libCall.args.forEach((arg : (number | ILibCall)) => {
        if (typeof arg == "number") {
            if (arg as number < inputs.length) {
                let input = PrepareInputs(lib, arg as number, inputs, values);
                libInputs.push(input[1]);
                if (input[0] == "ptr") {
                    freeLater.push(input[1]);
                }
                libInputTypes.push("number");
            }
            else if (arg as number - inputs.length < outputs.length) {
                let outputIndex : number =  arg as number - inputs.length;
                if (outputs[outputIndex].value == undefined && outputs[outputIndex].format == "bytearr") {
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

    if (libCall.packageName == "util") {
        return utilFunctions[libCall.functionName](libInputs);
    }
    let ret = lib.ccall(libCall.functionName, null, libInputTypes, libInputs);
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

function ResolverLoader (operation: string, inputFormats: IPort[], outputFormats: IPort[]) : IResolver {
    // Lex / Parse the operation
    let parsed : ILibCall = ParseLibCall(operation);

    let nInputs : number = inputFormats.length;
    let nOutputs : number = outputFormats.length;

    // Match operation with library
    return (lib: IModule, inputs: (number | string | Uint8Array)[]) : (number | string | Uint8Array)[] => {
        if (inputs.length != nInputs) {
            throw "RuntimeInputLengthException";
        }

        let libInputs : ILibInput[] = inputs.map((value, index) : ILibInput => {return { ...inputFormats[index], value: value, runtimeSize: undefined}});
        let libOutputs : ILibInput[] = outputFormats.map((value, index) : ILibInput => {return { ...value, value: undefined, runtimeSize: undefined}});
        let outputValues : (number | string | Uint8Array)[] = [];

        CalculateRuntimeSize(libInputs, libOutputs);

        console.log(libInputs);
        console.log(libOutputs);

        CallLibFunction(lib, parsed, libInputs, libOutputs);

        libOutputs.forEach(output => outputValues.push(output.value));

        ResetRuntimeSize(libInputs, libOutputs);

        return outputValues;
    };
}

// Block loader
function BlockLoader (packageName: string, blockName: string, lib : t.TypeOf<typeof RIBlockLibrary>) : ILoaderFunction {
    let constructor = function (props : IProps) {
        return AppBlockFactory(BlockTemplateFactory(lib.format), lib.label, this, props);
    };
    const packageInfo = { packageName, blockName }
    let resolver = ResolverLoader(lib.operation, lib.format.inputs, lib.format.outputs);
    return {...lib, ...packageInfo, resolver, constructor};
}

let StdBlocks : IBlockLibrary = {};
RIBlockLibraryFile.decode(blocks);  

let blockLibrary = ( blocks as any ) as t.TypeOf<typeof RIBlockLibraryFile>;

Object.keys(blockLibrary).forEach((category : string) =>  {
    StdBlocks[category] = {};
    Object.keys(blockLibrary[category]).forEach((blockName : string) => {
        StdBlocks[category][blockName] = BlockLoader(category, blockName, blockLibrary[category][blockName]);
    });
});

// Non-library blocks

let Eavesdropper : ILoaderFunction = {
    packageName: "Adversaries",
    blockName: "Eavesdropper",
    format: {
        outputs: [{
            side: "right",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined
        }],
        inputs: [{
            side: "left",
            position: 1,
            format: "bytearr",
            size: -1,
            runtimeSize: undefined
        }],
        size: [50, 50],
    },
    operation: "1=0",
    resolver: (input : any) : any[] => { return [ input ]; },
    label: "E",
    description: "Block used to eavesdrop on a block transition",
    constructor: function (props: IProps) {
        let factory = AppBlockFactory({
            inputs: [{
                side: "left",
                index: 1,
                connected: false,
            }],
            outputs: [{
                side: "right",
                index: 1,
                connected: false,
            }],
            size: [50, 50],
        }, "E", this, props);
        return factory;
    }
}

let Bob : ILoaderFunction = {
    packageName: "Outputs",
    blockName: "Bob",
    format: {
        outputs: [],
        inputs: [{
            side: "left",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined
        }],
        size: [50, 50],
    },
    operation: "0",
    resolver: (input : any) : any[] => { return; },
    label: "B",
    description: "Block used to specify the message receiver",
    constructor: function(props: IProps) {
        let factory = AppBlockFactory({
            inputs: [{
                side: "left",
                index: 1,
                connected: false,
            }],
            outputs: [],
            size: [50, 50],
        }, "B", this, props);
        return factory;
    }
}

let Alice : ILoaderFunction = {
    packageName: "Inputs",
    blockName: "Alice",
    format: {
        outputs: [{
            side: "right",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined
        }],
        inputs: [],
        size: [50, 50],
    },
    operation: "0",
    label: "A",
    resolver: () : any[] => { return; },
    description: "Block used to specify the message sender",
    constructor: function (props: IProps) {
        let factory = AppBlockFactory({
            outputs: [{
                side: "right",
                index: 1,
                connected: false,
            }],
            inputs: [],
            size: [50, 50],
        }, "A", this, props);
        return factory;
    }
}

let Split : ILoaderFunction = {
    packageName: "Control",
    blockName: "Split",
    format: {
        outputs: [{
            side: "top",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined
        },
        {
            side: "right",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined
        },
        {
            side: "bottom",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined
        }],
        inputs: [{
            side: "left",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined
        }],
        size: [50, 50],
    },
    operation: "util.split(0, 1, 2, 3)",
    label: "⑂",
    resolver: (lib : IModule, i) : any[] => { return [i[0], i[0], i[0]]; },
    description: "Block used to split a single wire into up to three .",
    constructor: function (props: IProps) {
        let factory = AppBlockFactory({
            outputs: [{
                side: "top",
                index: 1,
                connected: false,
            },
            {
                side: "bottom",
                index: 1,
                connected: false,
            },
            {
                side: "right",
                index: 1,
                connected: false,
            }],
            inputs: [{
                side: "left",
                index: 1,
                connected: false,
            }],
            size: [50, 50],
        }, "⑂", this, props);
        return factory;
    }
}

StdBlocks["Control Blocks"] = { Split }
StdBlocks["Inputs"] = { Alice }
StdBlocks["Outputs"] = { Bob }
StdBlocks["Adversaries"] = { Eavesdropper }

export { ILoaderFunction, StdBlocks, GetRuntime, IModule };
export default StdBlocks;