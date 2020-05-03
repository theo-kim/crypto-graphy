import * as React from 'react';
import { ContextMenu, MenuItem, ContextMenuTrigger } from 'react-contextmenu';

import Block, { IPropsCallback as BlockPropsCallback, IPropsReal as IBlockProps, IOnWireMoveEvent } from './Blocks/Block'
import { ILoaderFunction, BlockLibrary } from './Blocks/BlockLoad';
import { GetRuntime, IModule, generators } from './Blocks/LibLoad';
import ToolBar from './ToolBar';
import Console from './Console';

import appInfo from '../appInfo.json';
import { getJoinSemigroup } from 'fp-ts/lib/Semigroup';

// Interface definitions
interface IInputs {
    block : number;
    index: number;
    location : { x : number, y : number };
};

interface IWorkSpaceGraphNode {
    block: number;
    port: number;
    value: number | string | Uint8Array;
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
    zoom: number;
};

interface IBlockRender {
    construct: ILoaderFunction;
    ref?: HTMLDivElement;
    initialPosition: [ number, number ];
};

// Globals
let GraphState : IGraphConstants = {
    IMPOSSIBLE: { block: -2, port: -2, value: null },
    UNCONNECTED: { block: -1, port: -1, value: null },
};

// Class definitions
class WorkSpaceGraph {
    size : number = 0;
    outputGraph : IWorkSpaceGraphNode[][] = []; // Adjacency list
    inputGraph : IWorkSpaceGraphNode[][] = [];

    callStack : number[] = [];

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
        this.outputGraph[from][output] = { block: to, port: input, value: null };
        this.inputGraph[to][input] = { block: from, port: output, value: null };
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

    getUnconnectedInputs() : [number, number[]][] {
        let output : [number, number[]][] = [];
        for (let i = 0; i < this.size; ++i) {
            if (this.inputGraph[i] == null) continue;
            this.inputGraph[i].forEach((value : IWorkSpaceGraphNode, index: number) => {
                output.push([i, []]);
                if (value == GraphState.UNCONNECTED) {
                    output[output.length - 1][1].push(index);
                }
            })
        }
        return output;
    }

    resetGraph = () => {
        this.inputGraph.forEach((block, index) => {
            if (block != null) {
                block.forEach((node, pindex) => {
                    if (node != null) this.inputGraph[index][pindex].value = null;
                });
            }
        });
        this.outputGraph.forEach((block, index) => {
            if (block != null && index != 0) {
                block.forEach((node, pindex) => {
                    if (node != null) this.outputGraph[index][pindex].value = null;
                });
            }
        });
        generators.gen = {};
        this.callStack = [];
    }

    resolveGraph(blocks : IBlockRender[], reporter : (msg : string) => void) : Promise<boolean> {
        return GetRuntime().then((lib) => {
            this.resetGraph();
            this.resolveDefaults(blocks);
            console.log(this.inputGraph);
            console.log(this.outputGraph);
            this.resolveInputs(lib, 1, blocks, reporter);
            return Promise.resolve(true);    
        }, (e) => {
            console.log(e);
            return Promise.resolve(false);
        });
    }

    resolveDefaults = (blocks : IBlockRender[]) => {
        this.inputGraph.forEach((block, index) => {
            if (block == null) return;
            block.forEach((port, pindex) => {
                if (port == null) return;
                if (blocks[index].construct.format.inputs[pindex].default !== undefined) {
                    this.inputGraph[index][pindex].value = blocks[index].construct.format.inputs[pindex].default;
                }                
            });
        });
        this.outputGraph.forEach((block, index) => {
            if (block == null) return;
            block.forEach((port, pindex) => {
                if (port == null) return;
                if (blocks[index].construct.format.outputs[pindex].default !== undefined) {
                    console.log(blocks[index].construct.format.outputs[pindex].default);
                    this.outputGraph[index][pindex].value = blocks[index].construct.format.outputs[pindex].default;
                }                
            });
        });
    }

    resolveInputs = (lib : IModule, key : number, blocks : IBlockRender[], reporter: (msg : string) => void) => {
        // Resolve each input
        this.callStack.push(key);
        console.log(blocks[key].construct.blockName);
        console.log("Inputs: " + this.inputGraph[key].map(v => v.value));
        this.inputGraph[key].forEach((input: IWorkSpaceGraphNode, index: number) => {
            if (input.value === null) {
                // if the connected output is null, resolve that block's outputs
                while (this.outputGraph[input.block][input.port].value == null) {
                    if (this.callStack.indexOf(input.block) == -1 || (blocks[key].construct.format.inputs[index].required === undefined || blocks[key].construct.format.inputs[index].required === true)) {
                        this.resolveOutputs(lib, input.block, blocks, reporter);
                    }
                    else {
                        break;
                    }
                }
                // Assign connected output to the input
                input.value = this.outputGraph[input.block][input.port].value;
                if (input.block != 0)
                    this.outputGraph[input.block][input.port].value = null;
            }
        });
        this.callStack.pop();
    }
    
    resolveOutputs = (lib: IModule, key : number, blocks : IBlockRender[], reporter: (msg : string) => void) => {
        // Resolve the block's inputs
        this.resolveInputs(lib, key, blocks, reporter);
        let outputs : any[], inputs : any[];
        if (blocks[key].construct.packageName == "Constants") {
            let val : string | number = (blocks[key].ref.firstElementChild as HTMLInputElement).value;
            outputs = blocks[key].construct.resolver(lib, [ val ], reporter);
        }
        else if (blocks[key].construct.blockName == "Eavesdropper") {
            outputs = this.inputGraph[key].map((n : IWorkSpaceGraphNode) => n.value);
            reporter("Eavesdropper observed a value of: " + outputs[0]);
        }
        else {
            // Use resolver function to map inputs to outputs
            inputs = this.inputGraph[key].map((n : IWorkSpaceGraphNode) => n.value);
            outputs = blocks[key].construct.resolver(lib, inputs, reporter);
        }
        outputs.forEach((o : any, index: number) => {
            this.outputGraph[key][index].value = o as (number | string | Uint8Array);
        });
        if (inputs != null) {
            inputs.forEach((i : any, index: number) => {
                this.inputGraph[key][index].value = null;
            });
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

    newBlock = (block : IBlock, type: Function, inputs : Array<[number, number]>, ref : HTMLDivElement) => {
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

            previousState.blockElements[block.id].ref = ref;

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
            console.log("Connection");
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
                        value: d.value,
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
        if (this.state.blockElements[data.key].construct == BlockLibrary["Inputs"]["Alice"] || this.state.blockElements[data.key].construct == BlockLibrary["Outputs"]["Bob"]) {
            alert("You cannot delete Alice or Bob");
            return;
        }
        this.setState((previousState : IState, props : {}) => {
            previousState.blockElements[data.key] = null;
            return previousState;
        });
    }

    // Toolbar new block handler
    toolbarNewBlockHandler = (blockType: ILoaderFunction, coords?: [number, number]) => {
        let offset : [number, number] = [ 
            blockType.format.size[0] / 2,
            blockType.format.size[1] / 2
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

    duplicateBlockHandler = (e: any, data: any, target: any) => {
        if (this.state.blockElements[data.key].construct.blockName == "Alice" || this.state.blockElements[data.key].construct.blockName == "Bob") {
            alert("You cannot duplicate Alice or Bob blocks");
            return;        
        }
        this.toolbarNewBlockHandler(this.state.blockElements[data.key].construct);
    }

    // Show a description of the block
    showBlockInfoHandler = (e : any, data : any, target : any) => {
        let loader : ILoaderFunction = this.state.blockElements[data.key].construct;
        let name : string = loader.blockName;
        let packageName : string = loader.packageName;
        let description : string = loader.description;
        alert(description);
    }


    zoomIn = () => {
        this.setState({
            zoom: this.state.zoom + 0.1,
        })
    }

    zoomOut = () => {
        this.setState({
            zoom: this.state.zoom - 0.1,
        })
    }

    runProject = (reporter : (msg : string) => void) : Promise<boolean> => {
        if (this.verifyProject().length != 0) {
            return Promise.resolve(false);
        }
        return this.state.graph.resolveGraph(this.state.blockElements, reporter);
    }

    resolveOutputType(blockNum: number, outputNumber: number) : string {
        let type = this.state.blockElements[blockNum].construct.format.outputs[outputNumber].format;
        // If it inherits its type, check the inheritted type
        if (isNaN(parseInt(type)) == false) {
            let t = parseInt(type)
            type = this.state.blockElements[blockNum].construct.format.inputs[parseInt(type)].format;
            if (type === "inherit") {
                let p : IWorkSpaceGraphNode = this.state.graph.inputGraph[blockNum][t];
                if (p != null) type = this.resolveOutputType(p.block, p.port);
            }
        }
        return type;
    }

    verifyProject = () : string[] => {
        let errors : string[] = [];
        // Ensure that there are no blocks with unassigned inputs
        // Check 1: Make sure that Alice's value was set
        if (this.state.graph.outputGraph[0][0].value == null) {
            errors.push("\u00a0\u00a0> Alice has not been given a message, use command 'alice <message>'")
        }
        // Check 2: Find unassigned inputs
        let missingInputs : [number, number[]][] = this.state.graph.getUnconnectedInputs();
        if (missingInputs.length > 0) {
            missingInputs.forEach((value: [number, number[]]) => {
                if (value[1].length > 0) {
                    let blockName : string = this.state.blockElements[value[0]].construct.blockName;
                    errors.push("\u00a0\u00a0> Block " + blockName + " has " + value[1].length + " unconnected inputs, make sure that all inputs are connected with a wire");
                    value[1].forEach(i => {
                        this.state.blocks[value[0]].inputs[i].ref.className += " error";
                        this.state.blocks[value[0]].inputs[i].ref.parentElement.onclick = () => {
                            this.state.blocks[value[0]].inputs[i].ref.className = this.state.blocks[value[0]].inputs[i].ref.className.replace("error", "");
                            this.state.blocks[value[0]].inputs[i].ref.parentElement.onclick = () => {};
                        }
                    })
                }
            })
        }
        // Check 3: Find faulty inputs
        this.state.blockElements.forEach((el) => {
            if (el == null) return;
            if (el.ref.firstElementChild != null) {
                if (!(el.ref.firstElementChild as HTMLInputElement).checkValidity()) {
                    errors.push("\u00a0\u00a0> Block " + el.construct.blockName + " has an invalid input value")
                }
            }
        })
        // Check 4: Find incorrect types (essentially, byte array inputs accept all types, numbers only accept numbers)
        this.state.graph.inputGraph.forEach((node, nodeIndex) => {
            if (node == null) return;
            node.forEach((input, index) => {
                if (input == GraphState.UNCONNECTED) return;
                let inputType : string = this.state.blockElements[nodeIndex].construct.format.inputs[index].format;
                // an input that inherits its type is always correct
                if (inputType == "inherit") {
                    return;
                }
                let outputType : string = this.resolveOutputType(input.block, input.port);
                if (inputType == "number" && outputType != "number") {
                    this.state.blocks[input.block].outputs[input.port].ref.className += " error";
                    errors.push("\u00a0\u00a0> Block " + this.state.blockElements[nodeIndex].construct.blockName + " has an input of type " + inputType + " but is connected to an output of type " + outputType);
                }
                else if (inputType.includes("enum") && inputType != outputType) {
                    this.state.blocks[input.block].outputs[input.port].ref.className += " error";
                    errors.push("\u00a0\u00a0> Block " + this.state.blockElements[nodeIndex].construct.blockName + " has an input of type " + inputType + " but is connected to an output of type " + outputType);
                }
            })
        });

        if (errors.length > 0) {
            errors.unshift(errors.length + " errors found: ");
        }
        return errors;
    }

    handleConsoleCommand = (command : string, furtherInfoHook : (msg : string) => void) : string[] => {
        let tokenized : string[] = command.split(" ");
        let keyword : string = tokenized[0];
        if (!(keyword in appInfo.console)) {
            return [ "Command not recognized, type 'help' for help" ];
        }
        if (keyword == "help") {
            let commandList : { [name: string] : string } = appInfo.console;
            return Object.keys(commandList).map((name : string) => {
                let tab : string = "";
                for (let i = name.length; i < 9; ++i) {
                    tab += "\u00a0";
                }
                return name + tab + commandList[name as any];
            });
        }
        if (keyword == "alice") {
            tokenized.shift();
            if (tokenized.length == 0) {
                return [ "Missing a value, use 'alice <value>'"];
            }
            else {
                let message = tokenized.join(" ");
                if (isNaN(parseInt(message))) {
                    this.state.graph.outputGraph[0][0].value = message;
                    this.state.blockElements[0].construct.format.outputs[0].format = "string";
                }
                else {
                    this.state.graph.outputGraph[0][0].value = parseInt(message);
                    this.state.blockElements[0].construct.format.outputs[0].format = "number";
                }
                
                return [ "Alice will send the message: " + message ]
            }
        }
        if (keyword == "run") {
            this.runProject(furtherInfoHook).then((status) => {
                if (status) furtherInfoHook("Project succeeded, check output value with command 'bob'.");
                else furtherInfoHook("Project failed, verify it with command 'verify'.");
            })
            
            return [ "Running project..."];
        }
        if (keyword == "verify") {
            let errors : string[] = this.verifyProject();
            if (errors.length > 0) {
                return errors;
            }
            return [ "No errors found! Run your project with 'run'" ]
        }
        if (keyword == "bob") {
            if (this.state.graph.inputGraph[1][0].value == null) {
                return [ "Bob has not received a message yet, run the project with command 'run' first" ]
            }
            else {
                let bob = this.state.graph.inputGraph[1][0].value;
                let bobTranslated : string | number = "";
                if (typeof bob === "string" || typeof bob === "number") {
                    bobTranslated = bob;
                }
                else {
                    bob.forEach(byte => {
                        let chr = String.fromCharCode(byte);
                        if (chr.match(/[a-zA-Z0-9\ ]/i)) {
                            bobTranslated += " '" + String.fromCharCode(byte) + "' ";
                        }
                        else {
                            bobTranslated += " " + ("0" + (byte.toString(16))).slice(-2) + " ";
                        }
                    })
                }
                return [ "Bob received the message: " + bobTranslated ]
            }
        }
        return [ "Command not implemented yet" ];
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
        { construct: BlockLibrary["Inputs"]["Alice"], initialPosition: [ 125, 125 ] },
        { construct: BlockLibrary["Outputs"]["Bob"], initialPosition: [ 325, 325 ] },
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
            zoom: 1,
        };
    }
    
    render() {
        return (
            <ContextMenuTrigger
                holdToDisplay={-1}
                id={ "workspace" }
                attributes={{className : "workspace"}}>
                <div className="zoom-controller" 
                    style={{transform: "scale(" + this.state.zoom + ")" }}
                    ref={c => this.domRef = c}>
                    {
                        this.state.blockElements.map(($value : IBlockRender, index) => {
                            if ($value == null) { return null; }
                            return (
                                <ContextMenuTrigger
                                    key={ index }
                                    id={ "block-" + index }
                                    holdToDisplay={-1}>
                                    <$value.construct.constructor
                                        id={ index }
                                        position={ $value.initialPosition }
                                        connectedInputs={[]}
                                        connectedOutputs={this.state.graph.getConnectedOutputs(index)}
                                        zoom={this.state.zoom}
                                        { ...this.WorkSpaceController } />
                                </ContextMenuTrigger>
                            );
                        }).filter((el) => {
                            if (el == null) return false;
                            return true;
                        })
                    }
                </div>
                {
                    this.state.blockElements.map(($value : IBlockRender, index) => {
                        return (
                            <ContextMenu
                                key={ index }
                                id={ "block-" + index }>
                                <MenuItem data={{key: index}} onClick={this.deleteBlockHandler}>
                                    Delete Block
                                </MenuItem>
                                <MenuItem data={{key: index}} onClick={this.duplicateBlockHandler}>
                                    Duplicate Block
                                </MenuItem>
                                <MenuItem data={{key: index}} onClick={this.showBlockInfoHandler}>
                                    Block Info
                                </MenuItem>
                            </ContextMenu>
                        );
                    })
                }
                <Console onCommand={this.handleConsoleCommand}/>
                <ToolBar onNewBlock={this.toolbarNewBlockHandler}/>
                <ContextMenu
                    id={ "workspace" }>
                    <MenuItem onClick={this.zoomIn}>
                        Zoom In
                    </MenuItem>
                    <MenuItem onClick={this.zoomOut}>
                        Zoom Out
                    </MenuItem>
                </ContextMenu>
            </ContextMenuTrigger>
        );
    };
};

// module exports
export default WorkSpace;
export { WorkSpace, WorkSpaceGraph, GraphState };