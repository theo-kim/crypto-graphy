import * as React from 'react';
import update from 'immutability-helper';

import Draggable from 'react-draggable';
import { DraggableEvent, DraggableData } from 'react-draggable';

import Wire from '../Wire/Wire';

import * as appInfo from '../../appInfo.json';

interface IInputs {
    side: string;
    index: number;
    connected?: boolean;
}

interface IOutputs extends IInputs {}

interface IOnWireMoveEvent {
    wire : number;
    x ?: number;
    y ?: number;
}

interface IPropsCallback {
    onWireMove: (key : number,  index : number, coords : [number, number]) => void;
    onBlockMove : (key : number, coords : [number, number]) => void;
    onDrag : (key : number, coords : [number, number]) => void;
    onInit : (block: IPropsReal, type: Function, inputs : Array<[number, number]>) => void;
    onDestroy : (key : number) => void;
    onMoveWithConnectedWire: (key : number) => IOnWireMoveEvent[];
}

interface IPropsReal {
    readonly id : number,
    position ?: [ number, number ];
    readonly size: [ number, number ];
    readonly inputs: IInputs[];
    readonly outputs: IOutputs[];
}

interface IPropsMeta {
    label: string;
    dead: boolean;
}

interface IProps extends IPropsCallback, IPropsReal, IPropsMeta {};

interface IState {
    posX: number;
    posY: number;
    inputPos: Array<[number, number]>;
    outputPos: Array<[number, number]>;
    outputPosEnd: Array<[number, number]>;
};

export default class Block extends React.Component<IProps, IState> {
    static defaultProps = {
        size: [ 100, 100 ],
        label: "Block",
        position: [ 0, 0 ]
    };

    forceWireRender: number[] = [];

    constructor(props : IProps) {
        super(props);

        let xSlots = Math.floor(this.props.size[0] / 50);
        let ySlots = Math.floor(this.props.size[1] / 50);

        this.state = {
            posX: this.props.size[0] / 2 + this.props.position[0],
            posY: this.props.size[1] / 2 + this.props.position[1],
            outputPos: [], 
            outputPosEnd: [], 
            inputPos: [],
        };
        
        for (let i = 0; i < this.props.outputs.length; ++i) {
            if ((
                    (this.props.outputs[i].side == "top" || this.props.outputs[i].side == "bottom") &&
                    Math.abs(this.props.outputs[i].index) > ySlots
                ) ||
                    (this.props.outputs[i].side == "left" || this.props.outputs[i].side == "right") &&
                    Math.abs(this.props.outputs[i].index) > xSlots
            ) {
                console.error("Invalid position");
                continue;
            }

            let x : number;
            let y : number;

            switch (this.props.outputs[i].side) {
                case "top" :
                    y = 0;   
                    x = this.props.outputs[i].index * 25;
                    break;
                case "bottom" :
                    y = this.props.size[1];
                    x = this.props.outputs[i].index * 25;
                    break;
                case "left" :
                    x = 0;
                    y = this.props.outputs[i].index * 25;
                    break;
                case "right" :
                    x = this.props.size[0];
                    y = this.props.outputs[i].index * 25;
                    break;
            }
         
            this.state.outputPos.push([x, y]);
            this.state.outputPosEnd.push([x, y]);
        }

        for (let i = 0; i < this.props.inputs.length; ++i) {
            if ((
                    (this.props.inputs[i].side == "top" || this.props.inputs[i].side == "bottom") &&
                    Math.abs(this.props.inputs[i].index) > ySlots
                ) ||
                    (this.props.inputs[i].side == "left" || this.props.inputs[i].side == "right") &&
                    Math.abs(this.props.inputs[i].index) > xSlots
            ) {
                console.error("Invalid position");
                continue;
            }

            let x : number;
            let y : number;

            switch (this.props.inputs[i].side) {
                case "top" :
                    y = 0;   
                    x = this.props.inputs[i].index * 25;
                    break;
                case "bottom" :
                    y = this.props.size[1];
                    x = this.props.inputs[i].index * 25;
                    break;
                case "left" :
                    x = 0;
                    y = this.props.inputs[i].index * 25;
                    break;
                case "right" :
                    x = this.props.size[0];
                    y = this.props.inputs[i].index * 25;
                    break;
            }
         
            this.state.inputPos.push([x, y]);
        }
    }

    shouldComponentUpdate(nextProps : IProps, nextState : IState) : boolean {
        // Check if properties changed
        // Only property that can change is outputs (position is not allowed to change)
        for (let i = 0; i < nextProps.outputs.length; ++i) {
            if (nextProps.outputs[i].connected != this.props.outputs[i].connected) {
                return true;
            }
        }
        // Or check if the state changed
        // Change the output handle needs a rerender of the wire
        for (let i = 0; i < this.state.outputPosEnd.length; ++i) {
            for (let j = 0; j < 2; ++j) {
                if (this.state.outputPosEnd[i][j] != nextState.outputPosEnd[i][j]) {
                    return true;
                }
            }
        }
        // Finally check if a wire end moved with an input
        let e = this.props.onMoveWithConnectedWire(this.props.id)
        if (e.length != 0) {
            // Movement occured
            e.forEach(element => {
                nextState.outputPosEnd[element.wire][0] -= element.x;
                nextState.outputPosEnd[element.wire][1] -= element.y;
                this.forceWireRender.push(element.wire);
            });
            return true;
        }
        return false;
    }

    componentDidMount = () => {
        this.props.onInit({
            id: this.props.id, 
            position : [this.props.position[0] + (this.props.size[0] / 2), this.props.position[1] + (this.props.size[1] / 2)], 
            size : this.props.size,
            outputs : this.props.outputs,
            inputs : this.props.inputs,
        }, this.constructor, this.state.inputPos);
    }

    componentWillUnmount = () => {
        this.props.onDestroy(this.props.id);
    }

    checkConnectedHandler = (e : DraggableEvent, data : DraggableData ) => {
        let nx = data.x + (this.props.size[0] / 2);
        let ny = data.y + (this.props.size[1] / 2);

        let dx : number = Math.round((nx - this.state.posX) / appInfo.configurable.gridSize) * appInfo.configurable.gridSize;
        let dy : number = Math.round((ny - this.state.posY) / appInfo.configurable.gridSize) * appInfo.configurable.gridSize;

        let x : number = this.state.posX + dx;
        let y : number = this.state.posY + dy;

        this.setState((previousState : IState, props: IProps) => {
            let newState : any = {
                posX : x,
                posY : y,
                outputPosEnd : previousState.outputPosEnd,
            };

            this.props.outputs.forEach((value : IOutputs, index : number) => {
                if (value.connected === true) {
                    let updateItem : any = { }
                    updateItem[index] = { $set : [ 
                        this.state.outputPosEnd[index][0] - dx, 
                        this.state.outputPosEnd[index][1] - dy ] 
                    }
                    newState.outputPosEnd = update(this.state.outputPosEnd, updateItem);
                }
            });

            this.props.onDrag(this.props.id, [-dx, -dy]);

            return newState;
        });
    }

    dragHandler = (e : DraggableEvent, data : DraggableData ) => {
        this.props.onBlockMove(this.props.id, [this.state.posX, this.state.posY]);
    }

    outputDragHandler = (index : number, data : DraggableData) => {
        let updateItem : any = {};
        updateItem[index] = {$set : [data.x + 12.5, data.y + 12.5]};
        
        this.setState(() => {
            let newState = { outputPosEnd: update(this.state.outputPosEnd, updateItem) };
            return newState;
        });
    }

    outputDragReleaseHandler = (index : number, data : DraggableData) => {
        // Update parent
        let globalPosition : [ number, number ] = [ 
            this.state.outputPosEnd[index][0],
            this.state.outputPosEnd[index][1] 
        ];
        globalPosition[0] += this.state.posX - (this.props.size[0] / 2);
        globalPosition[1] += this.state.posY - (this.props.size[1] / 2);
        this.props.onWireMove(this.props.id, index, globalPosition);
    }

    render() {
        let wireRenderList = this.forceWireRender;
        this.forceWireRender = [];
        return (
            <Draggable
                // disabled={this.props.dead}
                bounds=".workspace"
                cancel=".output, .wire"
                grid={[appInfo.configurable.gridSize, appInfo.configurable.gridSize]}
                onStop={this.dragHandler}
                onDrag={this.checkConnectedHandler}
                defaultPosition={{x: this.props.position[0] - (this.props.size[0] / 2), y: this.props.position[1] - (this.props.size[1] / 2)}}>
                <div className="block"
                    style={{
                        width: this.props.size[0],
                        height: this.props.size[1]
                    }}>
                    <span className="label">{this.props.label}</span>
                    {
                        this.state.inputPos.map((pos : [number, number], index: number) => {
                            if (this.props.inputs[index].side == "top") { // Top
                                return (
                                    <div className="input top"
                                        key={index}
                                        style={{
                                            left: pos[0] - 12.5,
                                            top: pos[1]
                                        }} />
                                )    
                            }
                            if (this.props.inputs[index].side == "left") { // Left
                                return (
                                    <div className="input left"
                                        key={index}
                                        style={{
                                            left: pos[0],
                                            top: pos[1] - 12.5
                                        }} />
                                )    
                            }
                            if (this.props.inputs[index].side == "bottom") { // Bottom
                                return (
                                    <div className="input bottom"
                                        key={index}
                                        style={{
                                            left: pos[0] - 12.5,
                                            bottom: 0
                                        }} />
                                )    
                            }
                            if (this.props.inputs[index].side == "right") { // Right
                                return (
                                    <div className="input right"
                                        key={index}
                                        style={{
                                            right: 0,
                                            top: pos[1] - 12.5
                                        }} />
                                )    
                            }
                        })
                    }
                    {
                        this.state.outputPos.map((pos : [number, number], index: number) => {
                            return (
                                    <Draggable
                                        disabled={this.props.dead}
                                        key={index}
                                        grid={[appInfo.configurable.gridSize / 2, appInfo.configurable.gridSize / 2]}
                                        onDrag={(e, data) => { this.outputDragHandler(index, data) }}
                                        position={ { x : this.state.outputPosEnd[index][0] - 12.5, y: this.state.outputPosEnd[index][1] - 12.5} }
                                        onStop={(e, data) => { this.outputDragReleaseHandler(index, data) }}>
                                        <div className="output"></div>
                                    </Draggable>
                            );
                        })
                    }
                    {
                        this.state.outputPos.map((pos : [number, number], index: number) => {
                            return (
                                    <Wire key={index} 
                                        from={pos}
                                        to={this.state.outputPosEnd[index]}
                                        side={this.props.outputs[index].side}
                                        forceRender={wireRenderList.indexOf(index) !== -1}/>
                            );
                        })
                    }
                </div>
            </Draggable>
        );
    };
};

export { IPropsCallback, IPropsReal, IState, Block, IInputs, IOutputs, IOnWireMoveEvent };