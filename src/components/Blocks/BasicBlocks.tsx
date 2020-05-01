import * as React from 'react';
import * as t from 'io-ts';

import blocks from '../../../lib/blocks/std.json';

import { AppBlockProps as IProps, AppBlockFactory, BlockTemplateFactory } from './AppBlock'

const RIBlockLibrary = t.interface({
    operation: t.string,
    description: t.string,
    label: t.string,
    format: t.interface({
        size: t.array(t.number),
        input: t.array(t.interface({
            side: t.string,
            position: t.number,
            format: t.string
        })),
        output: t.array(t.interface({
            side: t.string,
            position: t.number,
            format: t.string
        }))
    })
});

type RIBlock = t.TypeOf<typeof RIBlockLibrary>;

interface ILoaderFunction extends RIBlock {
    packageName: string;
    blockName: string;
    constructor: Function;
}

const RIBlockLibraryFile = t.dictionary(t.string, t.dictionary(t.string, RIBlockLibrary));

type IBlockLibraryFile = t.TypeOf<typeof RIBlockLibraryFile>;
type IBlockLibrary = { [ packageName : string ] : { [ blockName : string ] : ILoaderFunction } };

// Block loader
function BlockLoader (packageName: string, blockName: string, lib : RIBlock) : ILoaderFunction {
    let construct = function (props : IProps) {
        return AppBlockFactory(BlockTemplateFactory(lib.format), lib.label, this, props);
    };
    const packageInfo = { packageName, blockName }
    return {...lib, ...packageInfo, constructor: construct};
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
        output: [{
            side: "right",
            position: 1,
            format: "bytearr",
        }],
        input: [{
            side: "left",
            position: 1,
            format: "bytearr",
        }],
        size: [50, 50],
    },
    operation: "1=0",
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
        output: [],
        input: [{
            side: "left",
            position: 1,
            format: "bytearr",
        }],
        size: [50, 50],
    },
    operation: "0",
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
        output: [{
            side: "right",
            position: 1,
            format: "bytearr",
        }],
        input: [],
        size: [50, 50],
    },
    operation: "0",
    label: "A",
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

StdBlocks["Inputs"] = { Alice }
StdBlocks["Outputs"] = { Bob }
StdBlocks["Adversaries"] = { Eavesdropper }

export { ILoaderFunction, StdBlocks };
export default StdBlocks;