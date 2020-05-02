import * as React from 'react';
import Draggable from 'react-draggable';
import ReactTooltip from "react-tooltip";

import { IPropsCallback as BlockPropsCallback } from './Blocks/Block'
import { BlockLibrary, ILoaderFunction } from './Blocks/BlockLoad';

interface IProps {
    onNewBlock: (blockType: ILoaderFunction, coords: [number, number]) => void;
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
                            Object.keys(BlockLibrary).map((category : string, catIndex : number) => {
                                if (category === "Inputs" || category === "Outputs") {
                                    return null
                                }
                                let packageBlocks = Object.keys(BlockLibrary[category]).map((blockName : string, index: number) => {
                                    let $blockType = BlockLibrary[category][blockName];
                                    return (
                                        <div onMouseDown={(e : React.MouseEvent) => { this.props.onNewBlock($blockType, [ e.clientX, e.clientY ]); }}
                                            className="wrapper"
                                            key={index}
                                            style={{
                                                marginLeft: -$blockType.format.size[0] / 8,
                                                marginRight: -$blockType.format.size[0] / 8,
                                                marginTop: -$blockType.format.size[1] / 8,
                                                marginBottom: -$blockType.format.size[1] / 8
                                            }}
                                            data-tip
                                            data-for={category + "-" + blockName}>
                                            <$blockType.constructor icon={true} />
                                        </div>
                                    );
                                });
                                let packageTooltips = Object.keys(BlockLibrary[category]).map((blockName : string, index: number) => {
                                    let $blockType = BlockLibrary[category][blockName];
                                    return (
                                        <ReactTooltip effect="solid" key={index} id={category + "-" + blockName}>{BlockLibrary[category][blockName].blockName}</ReactTooltip>
                                    );
                                });
                                return (
                                    <div className="toolbar-section"
                                        key={catIndex}>
                                        <div className="toolbar-section-name">{category}</div>
                                        { packageBlocks }
                                        { packageTooltips }
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