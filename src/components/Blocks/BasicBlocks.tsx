import * as React from 'react';

import { AppBlockProps as IProps, blockTemplates, AppBlockFactory, IconBlockFactory } from './AppBlock'

// Logic Blocks
class XORBlock extends React.Component<IProps, {}> {
    render() {
        return AppBlockFactory(blockTemplates.block2i1o(), "⊕", XORBlock, this.props);
    }
}

class ANDBlock extends React.Component<IProps, {}>  {
    render() {
        return AppBlockFactory(blockTemplates.block2i1o(), "∧", ANDBlock, this.props);
    }
}

class ORBlock extends React.Component<IProps, {}>  {
    render() {
        return AppBlockFactory(blockTemplates.block2i1o(), "∨", ORBlock, this.props);
    }
}

class NOTBlock extends React.Component<IProps, {}>  {
    render() {
        return AppBlockFactory(blockTemplates.block1i1o(), "~", NOTBlock, this.props);
    }
}

// People Blocks
class AliceBlock extends React.Component<IProps, {}> {
    render() {
        return AppBlockFactory(blockTemplates.block1o("right"), "A", AliceBlock, this.props);
    }
}

class BobBlock extends React.Component<IProps, {}> {
    render() {
        return AppBlockFactory(blockTemplates.block1o("left"), "B", BobBlock, this.props);
    }
}

class EveBlock extends React.Component<IProps, {}> {
    render() {
        return AppBlockFactory(blockTemplates.block2i(), "E", EveBlock, this.props);
    }
}

// Arithmetic Blocks
class AddBlock extends React.Component<IProps, {}> {
    render() {
        return AppBlockFactory(blockTemplates.block2i1o(), "+", AddBlock, this.props);
    }
}

class SubBlock extends React.Component<IProps, {}> {
    render() {
        return AppBlockFactory(blockTemplates.block2i1o(), "-", SubBlock, this.props);
    }
}

// Module Exports
let iconBlocks : Function[] = [XORBlock , ANDBlock, ORBlock, NOTBlock, AliceBlock, BobBlock, EveBlock, AddBlock, SubBlock]
export { XORBlock , ANDBlock, ORBlock, NOTBlock, AliceBlock, BobBlock, EveBlock, AddBlock, SubBlock, iconBlocks };