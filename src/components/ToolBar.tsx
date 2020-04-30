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
                            Object.keys(BasicBlocks['logic']).map((blockName : string, index: number) : JSX.Element => {
                                let $blockType = BasicBlocks['logic'][blockName];
                                return (
                                    <div onMouseDown={(e : React.MouseEvent) => { this.props.onNewBlock($blockType, [ e.clientX, e.clientY ]); }}
                                        style={{ transform: "scale(0.5)" }}
                                        className="wrapper"
                                        key={index}>
                                        <$blockType icon={true} />
                                    </div>
                                );
                            })
                        }
                    </div>
                </div>
            </Draggable>
        );
    };
};