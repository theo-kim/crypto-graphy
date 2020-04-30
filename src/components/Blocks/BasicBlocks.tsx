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

interface ILoaderFunction extends Function {
    description?: string;
    packageName?: string;
    blockName?: string;
}

const RIBlockLibraryFile = t.dictionary(t.string, t.dictionary(t.string, RIBlockLibrary));

type IBlockLibraryFile = t.TypeOf<typeof RIBlockLibraryFile>;
type IBlockLibrary = { [ packageName : string ] : { [ blockName : string ] : ILoaderFunction } };

// Block loader
function BlockLoader (packageName: string, blockName: string, lib : any) : ILoaderFunction {
    let loader : ILoaderFunction = function (props : IProps) {
        return AppBlockFactory(BlockTemplateFactory(lib.format), lib.label, this, props);
    };
    loader.description = lib.description;
    loader.packageName = packageName;
    loader.blockName = blockName;
    return loader;
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

function Eavesdropper(props: IProps) {
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

function Bob(props: IProps) {
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

function Alice(props: IProps) {
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

StdBlocks["Inputs"] = { Alice }
StdBlocks["Outputs"] = { Bob }
StdBlocks["Adversaries"] = { Eavesdropper }

export { ILoaderFunction, StdBlocks };
export default StdBlocks;