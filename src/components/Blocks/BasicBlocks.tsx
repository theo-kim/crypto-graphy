import * as React from 'react';
import * as t from 'io-ts';

import blocks from '../../../lib/blocks/std.json';

import { AppBlockProps as IProps, blockTemplates, AppBlockFactory, BlockTemplateFactory } from './AppBlock'

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
const RIBlockLibraryFile = t.dictionary(t.string, t.dictionary(t.string, RIBlockLibrary));

type IBlockLibraryFile = t.TypeOf<typeof RIBlockLibraryFile>;
type IBlockLibrary = { [ packageName : string ] : { [ blockName : string ] : Function } };

// Block loader
function BlockLoader (lib : any) : Function {
    return function (props : IProps) {
        console.log(lib);
        return AppBlockFactory(BlockTemplateFactory(lib.format), lib.label, this, props);
    };
}

let StdBlocks : IBlockLibrary = {};
RIBlockLibraryFile.decode(blocks);

let blockLibrary = ( blocks as any ) as t.TypeOf<typeof RIBlockLibraryFile>;

Object.keys(blockLibrary).forEach((category : string) =>  {
    StdBlocks[category] = {};
    Object.keys(blockLibrary[category]).forEach((blockName : string) => {
        StdBlocks[category][blockName] = BlockLoader(blockLibrary[category][blockName]);
    });
});

export default StdBlocks;

// // Logic Blocks
// class XORBlock extends React.Component<IProps, {}> {
//     render() {
//         return AppBlockFactory(blockTemplates.block2i1o(), "⊕", XORBlock, this.props);
//     }
// }

// class ANDBlock extends React.Component<IProps, {}>  {
//     render() {
//         return AppBlockFactory(blockTemplates.block2i1o(), "∧", ANDBlock, this.props);
//     }
// }

// class ORBlock extends React.Component<IProps, {}>  {
//     render() {
//         return AppBlockFactory(blockTemplates.block2i1o(), "∨", ORBlock, this.props);
//     }
// }

// class NOTBlock extends React.Component<IProps, {}>  {
//     render() {
//         return AppBlockFactory(blockTemplates.block1i1o(), "~", NOTBlock, this.props);
//     }
// }

// // People Blocks
// class AliceBlock extends React.Component<IProps, {}> {
//     render() {
//         return AppBlockFactory(blockTemplates.block1o("right"), "A", AliceBlock, this.props);
//     }
// }

// class BobBlock extends React.Component<IProps, {}> {
//     render() {
//         return AppBlockFactory(blockTemplates.block1o("left"), "B", BobBlock, this.props);
//     }
// }

// class EveBlock extends React.Component<IProps, {}> {
//     render() {
//         return AppBlockFactory(blockTemplates.block2i(), "E", EveBlock, this.props);
//     }
// }

// // Arithmetic Blocks
// class AddBlock extends React.Component<IProps, {}> {
//     render() {
//         return AppBlockFactory(blockTemplates.block2i1o(), "+", AddBlock, this.props);
//     }
// }

// class SubBlock extends React.Component<IProps, {}> {
//     render() {
//         return AppBlockFactory(blockTemplates.block2i1o(), "-", SubBlock, this.props);
//     }
// }

// // Module Exports
// let iconBlocks : Function[] = [XORBlock , ANDBlock, ORBlock, NOTBlock, AliceBlock, BobBlock, EveBlock, AddBlock, SubBlock]
// export { XORBlock , ANDBlock, ORBlock, NOTBlock, AliceBlock, BobBlock, EveBlock, AddBlock, SubBlock, iconBlocks };