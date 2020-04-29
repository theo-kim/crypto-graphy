import * as React from 'react';

import * as appInfo from '../../appInfo.json';

interface IProps {
    from: [number, number];
    to: [number, number];
    color?: string;
    width?: number;
    side: string;
    forceRender?: boolean;
};

interface IState {};

enum Direction {
    Up, Down, Left, Right
}

function LDiv (start : [number, number], end : [number, number], orientation : Direction) : React.CSSProperties {
    let left : boolean = end[0] < start[0] && (orientation == Direction.Down || orientation == Direction.Up);
    let down : boolean = end[1] > start[1] && (orientation == Direction.Left || orientation == Direction.Right);
    let up : boolean = !down && (orientation == Direction.Left || orientation == Direction.Right);
    let right : boolean = !left && !down && !up;

    let downSide = orientation != Direction.Up && (orientation == Direction.Down || up);
    let upSide = orientation != Direction.Down && (orientation == Direction.Up || down);
    let leftSide = orientation != Direction.Right && (orientation == Direction.Left || right);
    let rightSide = orientation != Direction.Left && (orientation == Direction.Right || left);
    
    return {
        position: "absolute",
        width: Math.abs(start[0] - end[0]),
        height: Math.abs(start[1] - end[1]),
        left: Math.min(start[0], end[0]),
        top: Math.min(start[1], end[1]),
        borderBottomStyle: downSide ? "solid" : "none",
        borderLeftStyle: leftSide ? "solid" : "none",
        borderTopStyle: upSide ? "solid" : "none",
        borderRightStyle: rightSide ? "solid" : "none",
        borderBottomLeftRadius: downSide && leftSide ? "10px" : "none",
        borderBottomRightRadius: downSide && rightSide ? "10px" : "none",
        borderTopLeftRadius: upSide && leftSide ? "10px" : "none",
        borderTopRightRadius: upSide && rightSide ? "10px" : "none",
    }
}

function UDiv (start : [number, number], end : [number, number], height: number, orientation: Direction) : React.CSSProperties {    
    let downSide = orientation != Direction.Up;
    let upSide = orientation != Direction.Down;
    let leftSide = orientation != Direction.Right;
    let rightSide = orientation != Direction.Left;

    let w : number = Math.abs(start[0] - end[0]);
    let h : number = height;

    if (orientation == Direction.Left || orientation == Direction.Right) {
        h = Math.abs(start[1] - end[1])
        w = height;
    }

    return {
        position: "absolute",
        width: w,
        height: h,
        left: Math.min(start[0], end[0]),
        top: Math.min(start[1], end[1]),
        borderBottomStyle: downSide ? "solid" : "none",
        borderLeftStyle: leftSide ? "solid" : "none",
        borderTopStyle: upSide ? "solid" : "none",
        borderRightStyle: rightSide ? "solid" : "none",
        borderBottomLeftRadius: downSide && leftSide ? "10px" : "none",
        borderBottomRightRadius: downSide && rightSide ? "10px" : "none",
        borderTopLeftRadius: upSide && leftSide ? "10px" : "none",
        borderTopRightRadius: upSide && rightSide ? "10px" : "none",
    }
}

export default class Wire extends React.Component<IProps, IState> {
    constructor(props : IProps) {
        super(props);
    }

    shouldComponentUpdate(newProps : IProps, newState : IState) : boolean {
        // Only to can change 
        if (newProps.to[0] != this.props.to[0] || newProps.to[1] != this.props.to[1]) {
            return true;
        }
        return (newProps.forceRender === true);
    }

    render() {
        let style : React.CSSProperties;
        let subWireStyle : React.CSSProperties = undefined;

        let dir : Direction = Direction.Up;

        switch(this.props.side) {
            case "top" :
                dir = Direction.Up;
                break;
            case "bottom" :
                dir = Direction.Down;
                break;
            case "left" :
                dir = Direction.Left;
                break;
            case "right" :
                dir = Direction.Right;
                break;
        }
        if (this.props.to[1] == this.props.from[1] && this.props.to[0] == this.props.from[0]) {
            return (<div />);
        }
        if (dir == Direction.Down) {
            if (this.props.from[1] < this.props.to[1]) {
                style = LDiv(this.props.from, this.props.to, dir);
            }
            else {
                style = UDiv(this.props.from, [this.props.to[0], this.props.from[1]], 50, dir);
                subWireStyle = LDiv([this.props.to[0], this.props.from[1]], this.props.to, Direction.Up);
            }
        }
        else if (dir == Direction.Up) {
            if (this.props.from[1] > this.props.to[1]) {
                style = LDiv(this.props.from, this.props.to, dir);
            }
            else {
                style = UDiv(this.props.from, [this.props.to[0], this.props.from[1]], 50, dir);
                subWireStyle = LDiv([this.props.to[0], this.props.from[1]], this.props.to, Direction.Down);
            }
        }
        else if (dir == Direction.Left) {
            if (this.props.from[0] > this.props.to[0]) {
                style = LDiv(this.props.from, this.props.to, dir);
            }
            else {
                style = UDiv(this.props.from, [this.props.from[0], this.props.to[1]], 50, dir);
                
            }
        }
        else if (dir == Direction.Right) {
            if (this.props.from[0] < this.props.to[0]) {
                style = LDiv(this.props.from, this.props.to, dir);
            }
            else {
                style = UDiv(this.props.from, [this.props.from[0], this.props.to[1]], 50, dir);
                subWireStyle = LDiv([0, Math.max(-3, this.props.to[1] - this.props.from[1])], [this.props.to[0] - this.props.from[0], Math.max(-3, this.props.to[1] - this.props.from[1])], Direction.Right);
            }
        }


        return (
            <div className = "wire"
                style={style}>
                {
                    (subWireStyle) ? (
                        <div className = "subWire" 
                            style={subWireStyle}
                            />
                    ) : null
                }
            </div>
        );
    };
};