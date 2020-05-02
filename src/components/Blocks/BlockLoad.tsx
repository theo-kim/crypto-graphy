import * as t from 'io-ts';

import blocks from '../../../lib/blocks/std.json';

import { AppBlockProps as IProps, AppBlockFactory, BlockTemplateFactory } from './AppBlock'

import { RIBlock, RIBlockLibrary, IPort, IModule, ptr, ILibCall, ParseLibCall, IResolver, ILibInput, ResetRuntimeSize, CallLibFunction, CalculateRuntimeSize } from './LibLoad';
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
                    return { side: input.side, index: input.position, connected: false } 
                }),
                outputs: format.outputs.map((input: IPort) : IInputs => { 
                    return { side: input.side, index: input.position, connected: false } 
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
        label: "E",
    },
    (input : any) : any[] => { return [ input ]; }
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
            runtimeSize: undefined
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
            runtimeSize: undefined
        }],
        inputs: [],
        size: [50, 50],
        label: "A",
    },
    () : any[] => { return; }
);

let Split : ILoaderFunction = BuiltInBlock(
    "Control", 
    "Split", 
    "Block used to split a single wire into up to three.",
    {
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
        label: "⑂",
    },
    (lib : IModule, i) : any[] => { return [i[0], i[0], i[0]]; },
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
            runtimeSize: undefined
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
            format: "number",
            size: undefined,
            runtimeSize: undefined
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
            format: "number",
            size: undefined,
            runtimeSize: undefined
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

//↻

StdBlocks["Constants"] = { Number, String, Array }
StdBlocks["Control Blocks"] = { Split }
StdBlocks["Inputs"] = { Alice }
StdBlocks["Outputs"] = { Bob }
StdBlocks["Adversaries"] = { Eavesdropper }

export { ILoaderFunction, StdBlocks as BlockLibrary };
export default StdBlocks;