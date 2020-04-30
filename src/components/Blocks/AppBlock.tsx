import * as React from 'react';

import Block, { IPropsCallback as IBlockProps, IInputs as BlockInput, IOutputs as BlockOutput } from './Block';

interface AppBlockProps extends IBlockProps {
    id: number;
    connectedOutputs: number[];
    connectedInputs: number[];
    icon?: boolean;
    position?: [ number, number ];
    description?: (description : string) => void;
}

interface IBlockTemplate {
    inputs: BlockInput[];
    outputs: BlockOutput[];
    size: [number, number];
};

interface IAppBlockProps extends AppBlockProps {
    type: Function;
    label: string;
    template: IBlockTemplate;
};

interface IIconBlockProps {
    label: string;
    template: IBlockTemplate;
}

let slot = function(side : string, index: number) : BlockOutput {
    return {
        side : side,
        index : index,
        connected: false,
    }
}

// sizes
let smallBlockSize : [ number, number ] = [50, 50];
let mediumBlockSize : [ number, number ] = [100, 100];
let largeBlockSize : [ number, number ] = [200, 200];

let block2i1o = function() : IBlockTemplate {
    return {
        inputs: [ slot("top", 1), slot("bottom", 1) ],
        outputs: [ slot("right", 1) ],
        size: smallBlockSize 
    }
}

let block1i1o = function() : IBlockTemplate {
    return {
        inputs: [ slot("left", 1) ],
        outputs: [ slot("right", 1) ],
        size: smallBlockSize,
    }
}

let block1o = function(side : string) : IBlockTemplate {
    return {
        inputs: [],
        outputs: [ slot(side, 1) ],
        size: smallBlockSize,
    }
}

let block2i = function() : IBlockTemplate {
    return {
        inputs: [ slot("right", 1), slot("left", 1) ],
        outputs: [],
        size: smallBlockSize,
    }
}

function BlockTemplateFactory(format : any) : IBlockTemplate {
    return {
        inputs: format.inputs.map((input : any) => slot(input.side, input.position)),
        outputs: format.outputs.map((output : any) => slot(output.side, output.position)),
        size: [ format.size[0], format.size[1] ],
    }
}

let blockTemplates = {
    block1i1o,
    block2i1o,
    block1o,
    block2i,
}

class AppBlock extends React.Component<IAppBlockProps, {}> {
    constructor(props : IAppBlockProps) {
        super(props);
    }

    render() {
        for (let i = 0; i < this.props.connectedInputs.length; ++i) {
            let n : number = this.props.connectedInputs[i];
            this.props.template.inputs[n].connected = true;
        } 

        for (let i = 0; i < this.props.connectedOutputs.length; ++i) {
            let n : number = this.props.connectedOutputs[i];
            this.props.template.outputs[n].connected = true;
        }

        return (
            <Block 
                {...this.props.template}
                label={this.props.label}
                onInit={(block, type, inputs) => { this.props.onInit(block, this.props.type, inputs) }}
                onBlockMove={this.props.onBlockMove}
                onWireMove={this.props.onWireMove}
                onDestroy={this.props.onDestroy}
                onMoveWithConnectedWire={this.props.onMoveWithConnectedWire}
                onDrag={this.props.onDrag}
                id={this.props.id}
                dead={false}
                position={this.props.position}
                />
        );
    }
}

class IconBlock extends React.Component<IIconBlockProps, {}> {
    render() {
        return (
            <Block 
                {...this.props.template}
                label={this.props.label}
                onInit={() => {}}
                onBlockMove={() => {}}
                onWireMove={() => {}}
                onDestroy={() => {}}
                onMoveWithConnectedWire={() => []}
                onDrag={() => {}}
                id={0}
                dead={true}
                position={[this.props.template.size[0] / 2, this.props.template.size[1] / 2]}
                />
        );
    }
}

function AppBlockFactory (template : IBlockTemplate, label: string, type: Function, props: AppBlockProps) {
    if (props.icon === true) return IconBlockFactory(template, label);
    return (
        <AppBlock 
            template={template}
            label={label}
            type={type}
            {...props}/>
    );
}

function IconBlockFactory (template : IBlockTemplate, label: string) {
    return (
        <IconBlock 
            template={template}
            label={label}/>
    );
}

export { AppBlockProps, blockTemplates, IBlockTemplate, AppBlock, AppBlockFactory, IconBlock, IconBlockFactory, BlockTemplateFactory };