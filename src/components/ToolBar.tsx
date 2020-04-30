import * as React from 'react';
import Draggable from 'react-draggable';

import { IPropsCallback as BlockPropsCallback } from './Blocks/Block'
import BasicBlocks from './Blocks/BasicBlocks';

interface IProps {
    onNewBlock: (blockType: Function, coords: [number, number]) => void;
};

interface IState {};

export default class ToolBar extends React.Component<IProps, IState> {
    EmptyController : BlockPropsCallback = {
        onWireMove: () => {},
        onBlockMove: () => {},
        onInit: () => {},
        onDestroy: () => {},
        onMoveWithConnectedWire: () => { return []; },
        onDrag: () => {}
    };
    
    render() {
        return (
            <Draggable
                handle="#toolbar-head"
                bounds="parent">
                <div id="toolbar">
                    <div id="toolbar-head">Toolbar</div>
                    <div id="toolbar-pallette">
                        {
                            Object.keys(BasicBlocks).map((category : string, catIndex : number) => {
                                if (category === "Inputs" || category === "Outputs") {
                                    return null
                                }
                                let packageBlocks = Object.keys(BasicBlocks[category]).map((blockName : string, index: number) => {
                                    let $blockType = BasicBlocks[category][blockName];
                                    return (
                                        <div onMouseDown={(e : React.MouseEvent) => { this.props.onNewBlock($blockType, [ e.clientX, e.clientY ]); }}
                                            className="wrapper"
                                            key={index}>
                                            <$blockType icon={true} />
                                        </div>
                                    );
                                });
                                return (
                                    <div className="toolbar-section"
                                        key={catIndex}>
                                        <div className="toolbar-section-name">{category}</div>
                                        { packageBlocks }
                                    </div>
                                );
                            }).filter((val) => { return val !== null; })
                        }
                    </div>
                </div>
            </Draggable>
        );
    };
};