import * as React from 'react';
import { ContextMenu, MenuItem, ContextMenuTrigger } from 'react-contextmenu';

import Block, { IPropsCallback as BlockPropsCallback, IPropsReal as IBlockProps, IOnWireMoveEvent } from './Blocks/Block'
import { ILoaderFunction, StdBlocks as BasicBlocks } from './Blocks/BasicBlocks';
import ToolBar from './ToolBar';

// Interface definitions
interface IInputs {
    block : number;
    index: number;
    location : { x : number, y : number };
};

interface IWorkSpaceGraphNode {
    block: number;
    port: number;
};

interface IPendingWireMove extends IOnWireMoveEvent, IWorkSpaceGraphNode {}

interface IEventTracker {
    type: Function,
    dirty: boolean,
    pendingTransformations: IPendingWireMove[];
}

interface IBlock extends IBlockProps, IEventTracker {};

interface IGraphConstants {
    IMPOSSIBLE: IWorkSpaceGraphNode;
    UNCONNECTED: IWorkSpaceGraphNode;
}   

interface IState {
    graph : WorkSpaceGraph;
    inputs: IInputs[];
    blocks: IBlock[];
    blockElements: IBlockRender[];
    pendingWireMoveEvent: IOnWireMoveEvent;
};

interface IBlockRender {
    construct: ILoaderFunction;
    initialPosition: [ number, number ];
};

// Globals
let GraphState : IGraphConstants = {
    IMPOSSIBLE: { block: -2, port: -2 },
    UNCONNECTED: { block: -1, port: -1 },
};

// Class definitions
class WorkSpaceGraph {
    size : number = 0;
    outputGraph : IWorkSpaceGraphNode[][] = []; // Adjacency list
    inputGraph : IWorkSpaceGraphNode[][] = [];

    constructor () {}
    
    produceEmptyEntry (slots : number) : IWorkSpaceGraphNode[] {
        let output : IWorkSpaceGraphNode[] = [];
        for (let j = 0; j < slots; ++j) {
            output.push(GraphState.UNCONNECTED);
        }
        return output;
    }

    addElement (inputSlots: number, outputSlots : number, index ?: number) : number {
        if (index != undefined) {
            // Check if index exceeds current size
            if (index >= this.size) {
                let newSize = index + 1;
                for (let i = this.size; i < newSize - 1; ++i) {
                    this.outputGraph.push(null); // Fill uninitialized with nulls
                    this.inputGraph.push(null); // Fill uninitialized with nulls
                    this.size += 1;
                }
                this.outputGraph.push(this.produceEmptyEntry(outputSlots));
                this.inputGraph.push(this.produceEmptyEntry(inputSlots));
                this.size += 1;
                return index;
            } 
            // Otherwise
            // Check for collision 
            if (this.outputGraph[index] != null) {
                throw "GraphCollisionException";
            }
            // Add to the graph at the given index
            this.outputGraph[index] = this.produceEmptyEntry(outputSlots);
            this.inputGraph[index] = this.produceEmptyEntry(inputSlots);
            return index;
        }
        for (let i = 0; i < this.size; ++i) {
            // Find empty slot
            if (this.outputGraph[i] == null) {
                // Initialize the list
                this.outputGraph[i] = this.produceEmptyEntry(outputSlots);
                this.inputGraph[i] = this.produceEmptyEntry(inputSlots);
                // indicate key
                return i;
            }
        }
        // No empty slots
        this.outputGraph.push(this.produceEmptyEntry(outputSlots));
        this.inputGraph.push(this.produceEmptyEntry(inputSlots));
        this.size += 1;
        return this.size - 1;
    }

    removeElement (key : number) : boolean {
        if (key >= this.size) {
            return false;
        }
        let danglingOutputs : IWorkSpaceGraphNode[] = this.outputGraph[key];
        let danglingInputs : IWorkSpaceGraphNode[] = this.inputGraph[key];
        // Remove references
        danglingOutputs.forEach((el : IWorkSpaceGraphNode) => {
            if (el != GraphState.UNCONNECTED) {
                this.inputGraph[el.block][el.port] = GraphState.UNCONNECTED;
            }
        });
        danglingInputs.forEach((el : IWorkSpaceGraphNode) => {
            if (el != GraphState.UNCONNECTED) {
                this.outputGraph[el.block][el.port] = GraphState.UNCONNECTED;
            }
        });
        this.outputGraph[key] = null;
        this.inputGraph[key] = null;
        
        return true;
    }

    addEdge(from : number, to : number, output : number, input : number) {
        if (from > this.size || to > this.size) {
            throw "OutOfBoundGraphException";
        }
        if (this.outputGraph[from] == null || this.outputGraph[to] == null) {
            throw "IndexException";
        }
        if (this.outputGraph[from][output] == GraphState.IMPOSSIBLE) {
            throw "ImpossibleEdgeException";
        }
        // NOT SURE
        if ((this.outputGraph[from][output] != GraphState.UNCONNECTED && this.outputGraph[from][output].block != to) && 
            (this.inputGraph[to][input] != GraphState.UNCONNECTED && this.inputGraph[to][input].block != from)) {
            throw "DoubleEdgeException";
        }
        if (output > this.outputGraph[from].length || input > this.inputGraph[to].length) {
            throw "OutOfBoundBucketException";
        }
        this.outputGraph[from][output] = { block: to, port: input};
        this.inputGraph[to][input] = { block: from, port: output };
    }

    removeEdge(key : number, index : number) {
        if (key > this.size) {
            throw "OutOfBoundGraphException";
        }
        if (this.outputGraph[key] == null) {
            throw "IndexException";
        }
        if (index > this.outputGraph[key].length) {
            throw "OutOfBoundBucketException";
        }
        if (this.outputGraph[key][index] == GraphState.UNCONNECTED) {
            return;
        }
        let to : IWorkSpaceGraphNode = this.outputGraph[key][index];
        this.outputGraph[key][index] = GraphState.UNCONNECTED;
        this.inputGraph[to.block][to.port] = GraphState.UNCONNECTED;
    }

    getConnectedOutputs (key : number) : number[] {
        if (key >= this.size || this.outputGraph[key] === null) {
            return [];
        }
        
        let output : number[] = [];
        
        this.outputGraph[key].forEach((el : IWorkSpaceGraphNode, index: number) => {
            if (el != GraphState.UNCONNECTED) {
                output.push(index);
            }
        });
        return output;
    }

    getConnectedBlocks (key : number, index ?: number) : IWorkSpaceGraphNode[] {
        let output : IWorkSpaceGraphNode[] = [];
        if (index != undefined) {
            // Get specific connection
            return [ this.inputGraph[key][index] ];
        }
        else {
            // Get all connections
            this.inputGraph[key].forEach((connection : IWorkSpaceGraphNode) => {
                if (connection != GraphState.UNCONNECTED) {
                    output.push(connection);
                }
            });
            return output;
        }
    }
}

class WorkSpace extends React.Component<{}, IState> {
    deleteBlock = (key : number) => {
        // TODO: Finish
        this.setState((previousState : IState) => {
            // Remove from the graph
            previousState.graph.removeElement(key);
            // Remove from the list
            previousState.blocks[key] = null;
            previousState.inputs = this.state.inputs.filter((value : IInputs) => {
                if (value.block == key) {
                    return false;
                }
                return true;
            })
            console.log("Block Deleted at key " + key);
            return previousState;
        });
    }

    newBlock = (block : IBlock, type: Function, inputs : Array<[number, number]>) => {
        this.setState((previousState : IState, props : {}) => {
            previousState.graph.addElement(block.inputs.length, block.outputs.length, block.id);
            let b : IEventTracker = {
                type: type,
                dirty: false,
                pendingTransformations: [],
            }
            if (previousState.blocks.length > block.id) {
                previousState.blocks[block.id] = {...block, ...b};
            }
            else {
                previousState.blocks.push({...block, ...b});
            }
            inputs.forEach((value : [number, number], index : number) => {
                previousState.inputs.push({
                    block: block.id,
                    index: index,
                    location: { x: value[0], y: value[1] },
                });
            });

            // console.log("New Block Registered with " + inputs.length + " inputs!");
            
            return null;
        });
    }

    trackBlocks = (key : number, coords : [ number, number ]) => {
        this.setState((previousState : IState, props : {}) => {
            // console.log("Block #" + key + " moved to position " + coords[0] + ", " + coords[1]);
            previousState.blocks[key].position[0] = coords[0];
            previousState.blocks[key].position[1] = coords[1];
            return previousState;
        });
    }   

    trackWireEnds = (key: number, index: number, coords: [number, number]) => {
        let connection : number = this.detectConnections(coords);
        if (connection >= 0) {
            this.setState((previousState : IState, props : {}) => {
                previousState.graph.addEdge(key, this.state.inputs[connection].block, index, this.state.inputs[connection].index);
                return previousState;
            });
        }
        else {
            this.setState((previousState : IState, props : {}) => {
                this.state.graph.removeEdge(key, index);                
                return previousState;
            });
        }
        // console.log("Block #" + key + ", output # " + index + " moved to position " + coords[0] + ", " + coords[1]);
    }

    updateDependencies = (key : number, coords: [number, number]) => {
        this.setState((previousState : IState, props : {}) => {
            // console.log("Block #" + key + " moved to position " + coords[0] + ", " + coords[1]);
            let dx : number = coords[0];
            let dy : number = coords[1];
            // Check if that block has any inputs
            let dependencies : IWorkSpaceGraphNode[] = this.state.graph.getConnectedBlocks(key);
            if (dependencies.length > 0) {
                dependencies.forEach((d : IWorkSpaceGraphNode) => {
                    previousState.blocks[d.block].dirty = true;
                    previousState.blocks[d.block].pendingTransformations.push({
                        block: d.block,
                        port: d.port,
                        wire: d.port,
                        x: dx,
                        y: dy,
                    });
                })    
            }
            return previousState;
        });
    }

    trackWireDependency = (key : number) : IOnWireMoveEvent[] => {
        let output : IOnWireMoveEvent[] = [];
        // console.log(this.state.blocks[key].dirty)
        if (this.state.blocks[key].dirty === true) {
            this.state.blocks[key].dirty = false;
            this.state.blocks[key].pendingTransformations.forEach((t : IPendingWireMove) => {
                output.push({
                    wire: t.port,
                    x: t.x,
                    y: t.y
                });
            });
            this.state.blocks[key].pendingTransformations = [];
        }
        return output;
    }

    // find connections in wires
    detectConnections(coords : [number, number]) : number {
        for (let i = 0; i < this.state.inputs.length; ++i) {
            let input : IInputs = this.state.inputs[i];
            let block : IBlock = this.state.blocks[input.block];
            let effectivePosition = [
                input.location.x + block.position[0] - (block.size[0] / 2),
                input.location.y + block.position[1] - (block.size[1] / 2),
            ];

            if (coords[0] == effectivePosition[0] && coords[1] == effectivePosition[1]) {
                return i;
            }
        }
        return -1;
    }

    // delete block
    deleteBlockHandler = (e : any, data : any, target : any) => {
        this.setState((previousState : IState, props : {}) => {
            previousState.blockElements[data.key] = null;
            return previousState;
        });
    }

    // Toolbar new block handler
    toolbarNewBlockHandler = (blockType: Function, coords?: [number, number]) => {
        let offset : [number, number] = [ 
            Math.round((this.domRef.getBoundingClientRect().width / 2) / 50) * 50,
            Math.round((this.domRef.getBoundingClientRect().height / 2) / 50) * 50
        ]
        this.setState((previousState : IState, props : {}) => {
            let insertionPoint = -1;
            previousState.blockElements.forEach((element, index) => {
                if (element == null) {
                    insertionPoint = index;
                }
            });
            if (insertionPoint > -1) {
                previousState.blockElements[insertionPoint] = {
                    construct: blockType,
                    initialPosition: offset,
                };
            }
            else {
                previousState.blockElements.push({
                    construct: blockType,
                    initialPosition: offset,
                });
            }
            
            return previousState;
        });
    };

    // Show a description of the block
    showBlockInfoHandler = (e : any, data : any, target : any) => {
        let loader : ILoaderFunction = this.state.blockElements[data.key].construct;
        let name : string = loader.blockName;
        let packageName : string = loader.packageName;
        let description : string = loader.description;
        alert(description);
    }

    WorkSpaceController : BlockPropsCallback = {
        onWireMove: this.trackWireEnds,
        onBlockMove: this.trackBlocks,
        onInit: this.newBlock,
        onDestroy: this.deleteBlock,
        onMoveWithConnectedWire: this.trackWireDependency,
        onDrag: this.updateDependencies
    };

    defaultBlocks : IBlockRender[] = [ 
        { construct: BasicBlocks["Logic Gates"]["XOR"], initialPosition: [ 100, 100 ] },
        { construct: BasicBlocks["Logic Gates"]["AND"], initialPosition: [ 300, 100 ] },
    ];

    domRef : HTMLDivElement = null;

    constructor(props : object) {
        super(props);

        this.state = {
            graph: new WorkSpaceGraph(),
            inputs: [],
            blocks: [],
            blockElements: [...this.defaultBlocks],
            pendingWireMoveEvent: { wire: -1 },
        };
    }
    
    render() {
        // console.log("Workspace render");
        return (
            <div className="workspace"
                ref={c => this.domRef = c}>
                {
                    this.state.blockElements.map(($value : IBlockRender, index) => {
                        if ($value == null) { return null; }
                        return (
                            <ContextMenuTrigger
                                key={ index }
                                id={ "block-" + index }
                                >
                                <$value.construct
                                    id={ index }
                                    position={ $value.initialPosition }
                                    connectedInputs={[]}
                                    connectedOutputs={this.state.graph.getConnectedOutputs(index)}
                                    { ...this.WorkSpaceController } />
                            </ContextMenuTrigger>
                        );
                    }).filter((el) => {
                        if (el == null) return false;
                        return true;
                    })
                }
                {
                    this.state.blockElements.map(($value : IBlockRender, index) => {
                        return (
                            <ContextMenu
                                key={ index }
                                id={ "block-" + index }>
                                <MenuItem data={{key: index}} onClick={this.deleteBlockHandler}>
                                    Delete Block
                                </MenuItem>
                                <MenuItem data={{key: index}} onClick={(e : any, data : any, target : any) => { this.toolbarNewBlockHandler(this.state.blockElements[data.key].construct); }}>
                                    Duplicate Block
                                </MenuItem>
                                <MenuItem data={{key: index}} onClick={this.showBlockInfoHandler}>
                                    Block Info
                                </MenuItem>
                            </ContextMenu>
                        );
                    })
                }
                <ToolBar onNewBlock={this.toolbarNewBlockHandler}/>
            </div>);
    };
};

// module exports
export default WorkSpace;
export { WorkSpace, WorkSpaceGraph, GraphState };