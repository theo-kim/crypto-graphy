import * as t from 'io-ts';

import blocks from '../../../lib/blocks/std.json';

import { AppBlockProps as IProps, AppBlockFactory, BlockTemplateFactory } from './AppBlock'

import { RIBlock, RIBlockLibrary, IPort, IModule, ptr, ILibCall, ParseLibCall, IResolver, ILibInput, ResetRuntimeSize, CallLibFunction, CalculateRuntimeSize, ConvertToArray, ConvertToNumber } from './LibLoad';
import { IInputs } from './Block';

interface ILoaderFunction extends RIBlock {
    packageName: string;
    blockName: string;
    constructor: Function;
}

const RIBlockLibraryFile = t.dictionary(t.string, t.dictionary(t.string, RIBlockLibrary));

type IBlockLibraryFile = t.TypeOf<typeof RIBlockLibraryFile>;
type IBlockLibrary = { [ packageName : string ] : { [ blockName : string ] : ILoaderFunction } };

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
interface IBuiltInFormat { outputs: IPort[], inputs: IPort[], size: [number, number], label: string }
function BuiltInBlock(packageName : string, blockName : string, description: string, format: IBuiltInFormat, resolver: IResolver) : ILoaderFunction {
    return {
        packageName: packageName,
        blockName: blockName,
        format: {
            outputs: format.outputs,
            inputs: format.inputs,
            size: format.size
        },
        operation: "",
        label: format.label,
        resolver: resolver,
        description: description,
        constructor: function (props: IProps) {
            let factory = AppBlockFactory({
                inputs: format.inputs.map((input: IPort) : IInputs => { 
                    return { side: input.side, index: input.position, connected: false, label: input.label } 
                }),
                outputs: format.outputs.map((input: IPort) : IInputs => { 
                    return { side: input.side, index: input.position, connected: false, label: input.label } 
                }),
                size: format.size,
            }, format.label, this, props);
            return factory;
        }
    };
}

let Eavesdropper : ILoaderFunction = BuiltInBlock(
    "Adversaries", 
    "Eavesdropper", 
    "Block used to eavesdrop on a block transition",
    {
        outputs: [{
            side: "right",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined,
            label: "Message In"
        }],
        inputs: [{
            side: "left",
            position: 1,
            format: "bytearr",
            size: -1,
            runtimeSize: undefined,
            label: "Message Out"
        }],
        size: [50, 50],
        label: "E",
    },
    (input : any) : any[] => { return [ input ]; }
);

let Intruder : ILoaderFunction = BuiltInBlock(
    "Adversaries", 
    "Intruder", 
    "Block used to alter a signal to test integrity",
    {
        outputs: [{
            side: "right",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined,
            label: "Message Out"
        }],
        inputs: [{
            side: "top",
            position: 1,
            format: "bytearr",
            size: -1,
            runtimeSize: undefined,
            label: "Malicious Message In"
        },
        {
            side: "left",
            position: 1,
            format: "bytearr",
            size: -1,
            runtimeSize: undefined,
            label: "Normal Message In"
        }],
        size: [50, 50],
        label: "T",
    },
    (lib, input : any[]) : any[] => { return [ input[0] ]; }
);

let Bob : ILoaderFunction = BuiltInBlock(
    "Outputs", 
    "Bob", 
    "Block used to specify the message receiver",
    {
        outputs: [],
        inputs: [{
            side: "left",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined,
            label: "Message In"
        }],
        size: [50, 50],
        label: "B",
    },
    (input : any) : any[] => { return; }
);

let Alice : ILoaderFunction = BuiltInBlock(
    "Inputs", 
    "Alice", 
    "Block used to specify the message sender",
    {
        outputs: [{
            side: "right",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined,
            label: "Message Out"
        }],
        inputs: [],
        size: [50, 50],
        label: "A",
    },
    () : any[] => { return; }
);

let Split : ILoaderFunction = BuiltInBlock(
    "Utility Blocks", 
    "Split", 
    "Block used to split a single wire into up to three.",
    {
        outputs: [{
            side: "top",
            position: 1,
            format: "0",
            size: undefined,
            runtimeSize: undefined,
            label: "Message Out"
        },
        {
            side: "right",
            position: 1,
            format: "0",
            size: undefined,
            runtimeSize: undefined,
            label: "Message Out"
        },
        {
            side: "bottom",
            position: 1,
            format: "0",
            size: undefined,
            runtimeSize: undefined,
            label: "Message Out"
        }],
        inputs: [{
            side: "left",
            position: 1,
            format: "inherit",
            size: undefined,
            runtimeSize: undefined,
            label: "Message In"
        }],
        size: [50, 50],
        label: "⑂",
    },
    (lib : IModule, i) : any[] => { 
        let v = i[0];
        i[0] = null;
        return [v, v, v];
    },
);

let AsNumber : ILoaderFunction = BuiltInBlock(
    "Utility Blocks", 
    "AsNumber", 
    "Block used to convert a list or string to a number (drops extra bytes).",
    {
        outputs: [
        {
            side: "right",
            position: 1,
            format: "number",
            size: undefined,
            runtimeSize: undefined,
            label: "Number"
        }],
        inputs: [{
            side: "left",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined,
            label: "Input"
        }],
        size: [50, 50],
        label: "🔢",
    },
    (lib : IModule, i) : any[] => { return [ ConvertToNumber(i[0]) ]; },
);

let Length : ILoaderFunction = BuiltInBlock(
    "Utility Blocks", 
    "Length", 
    "Block used to get the length of an input in bytes",
    {
        outputs: [
        {
            side: "right",
            position: 1,
            format: "number",
            size: undefined,
            runtimeSize: undefined,
            label: "Length"
        }],
        inputs: [{
            side: "left",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined,
            label: "Input"
        }],
        size: [50, 50],
        label: "N",
    },
    (lib : IModule, i) : any[] => { if (typeof i == "number") return [ 4 ]; return [ (i[0] as string | Uint8Array).length ]; },
);

let Index : ILoaderFunction = BuiltInBlock(
    "Utility Blocks", 
    "Index", 
    "Block used to get the nth element from a string or byte array",
    {
        outputs: [
        {
            side: "right",
            position: 1,
            format: "number",
            size: undefined,
            runtimeSize: undefined,
            label: "nth Element"
        }],
        inputs: [{
            side: "left",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined,
            label: "Array"
        },
        {
            side: "bottom",
            position: 1,
            format: "number",
            size: undefined,
            runtimeSize: undefined,
            label: "n"
        }],
        size: [50, 50],
        label: "[ ]",
    },
    (lib : IModule, i : any[]) : any[] => { return [ i[0][i[1]] ]; },
);

let Append : ILoaderFunction = BuiltInBlock(
    "Utility Blocks", 
    "Append", 
    "Block used to append a new byte to the end of a byte array. NOTE: only a byte will be pushed, therefore a number greater than 256 will not be pushed, only the least significant byte",
    {
        outputs: [
        {
            side: "right",
            position: 2,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined,
            label: "nth Element"
        }],
        inputs: [{
            side: "left",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined,
            label: "Array"
        },
        {
            side: "left",
            position: 3,
            format: "number",
            size: undefined,
            runtimeSize: undefined,
            label: "Byte"
        }],
        size: [50, 100],
        label: "→",
    },
    (lib : IModule, i : any[]) : any[] => { 
        let n : Uint8Array = new Uint8Array(i[0].length + 1); 
        n.set(i[0]);
        n.set([ i[1] ], i[0].length)
        return [ n ];
    },
);

let Condition : ILoaderFunction = BuiltInBlock(
    "Utility Blocks", 
    "Conditional", 
    "Block used to perform a conditional branch: if the input value is 0, it forwards Input A to the output, otherwise it forwards Input B to the output",
    {
        outputs: [
        {
            side: "right",
            position: 2,
            format: "0",
            size: undefined,
            runtimeSize: undefined,
            label: "Output"
        }],
        inputs: [{
            side: "left",
            position: 1,
            format: "inherit",
            size: undefined,
            runtimeSize: undefined,
            label: "Input A",
            required: false
        },
        {
            side: "left",
            position: 3,
            format: "inherit",
            size: undefined,
            runtimeSize: undefined,
            label: "Input B",
            required: false
        },
        {
            side: "bottom",
            position: 1,
            format: "number",
            size: undefined,
            runtimeSize: undefined,
            label: "Condition"
        }],
        size: [50, 100],
        label: "?",
    },
    (lib : IModule, i) : any[] => { 
        let condition = i[2];
        if (condition === 0) 
            return [ i[0] ];
        return [ i[1] ]; 
    },
);

let Loop : ILoaderFunction = BuiltInBlock(
    "Utility Blocks", 
    "Loop", 
    "Block used to perform an operation multiple times, feed each output back into itself and return the output",
    {
        outputs: [{
            side: "left",
            position: 1,
            format: "0",
            size: undefined,
            runtimeSize: undefined,
            label: "Loop Back Value",
            default: 0,
        },
        {
            side: "right",
            position: 2,
            format: "0",
            size: undefined,
            runtimeSize: undefined,
            label: "Loop Out Value"
        },
        {
            side: "bottom",
            position: 1,
            format: "number",
            size: undefined,
            runtimeSize: undefined,
            label: "Current Iteration Out",
            default: 0
        }],
        inputs: [{
            side: "left",
            position: 3,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined,
            label: "Loop in Value"
        },
        {
            side: "bottom",
            position: 3,
            format: "number",
            size: undefined,
            runtimeSize: undefined,
            label: "Current Iteration In"
        },
        {
            side: "top",
            position: 1,
            format: "number",
            size: undefined,
            runtimeSize: undefined,
            label: "Number of Loops"
        },
        {
            side: "top",
            position: 3,
            format: "inherit",
            size: undefined,
            runtimeSize: undefined,
            label: "Default Loop Back Value"
        }],
        size: [100, 100],
        label: "↻",
    },
    // Back, Out, iteration
    // in, iteration, num, default
    (lib : IModule, i) : any[] => { 
        let outset : any[];
        let output : any;
        if (i[0] == undefined) output = i[3];
        else output = i[0];
        if (i[1] >= i[2]) 
            outset = [ null, output, i[2] ];
        else 
            outset = [ output, null, (i[1] as number + 1) ];
        i[1] = null;
        return outset;
    },
);


let Number : ILoaderFunction = BuiltInBlock(
    "Constants", 
    "Number", 
    "Block used to specify a constant number",
    {
        outputs: [{
            side: "right",
            position: 1,
            format: "number",
            size: undefined,
            runtimeSize: undefined,
            label: "Value"
        }],
        inputs: [],
        size: [100, 50],
        label: "<input type=\"number\" min=\"0\" style=\"width:40px\"/> 🔢",
    },
    (lib : IModule, i : string[]) : any[] => { return [ parseInt(i[0]) ]; }
);

let String : ILoaderFunction = BuiltInBlock(
    "Constants", 
    "String", 
    "Block used to specify a constant string",
    {
        outputs: [{
            side: "right",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined,
            label: "Value"
        }],
        inputs: [],
        size: [150, 50],
        label: "<input type=\"string\" style=\"width:90px\"/> 🔤",
    },
    (lib : IModule, i) : any[] => { return i; }
);

let Array : ILoaderFunction = BuiltInBlock(
    "Constants", 
    "Array", 
    "Block used to specify a constant array",
    {
        outputs: [{
            side: "right",
            position: 1,
            format: "bytearr",
            size: undefined,
            runtimeSize: undefined,
            label: "Value"
        }],
        inputs: [],
        size: [150, 50],
        label: "<input type=\"string\" style=\"width:90px\" pattern=\"([0-9]+,[ ]?)*([0-9]+)\"/>",
    },
    (lib : IModule, i: string[]) : any[] => { 
        let arr = [ new Uint8Array(i[0].split(",").map(s => parseInt(s.replace(" ", "")))) ];
        console.log(arr);
        return arr;
    }
);

StdBlocks["Constants"] = { Number, String, Array }
StdBlocks["Utility Blocks"] = { Split, AsNumber, Length, Index, Loop, Condition, Append }
StdBlocks["Inputs"] = { Alice }
StdBlocks["Outputs"] = { Bob }
StdBlocks["Adversaries"] = { Eavesdropper, Intruder }

export { ILoaderFunction, StdBlocks as BlockLibrary };
export default StdBlocks;