declare module 'blocks.json' {
    interface IBlockLibraryFile {
        [packageName : string] : { 
            [blockName : string] : {
                operation: string;
                description: string;
                size: [ number, number ],
                label: string;
                format: {
                    inputs: {
                        side: string;
                        position: number;
                        format: string;
                    }[];
                    outputs: {
                        side: string;
                        position: number;
                        format: string;
                    }[];
                }
            }
        }
    }
    const value : IBlockLibraryFile;
    export default value
}