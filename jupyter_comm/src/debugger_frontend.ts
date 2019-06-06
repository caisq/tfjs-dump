import * as tf from '@tensorflow/tfjs-core';

import {JupyterClass, JupyterCommMessage} from './jupyter_types';
import {toHTMLEntities} from './string_utils';
import {DebuggerWatchPanel, RequestTensorFunction, TensorWireFormat, VariableSummary} from './watch_panel';

declare const Jupyter: JupyterClass;

console.log('In debugger_frontend.ts');  // DEBUG

export interface DebuggerCommand {
  command: 'step' | 'get_tensor_value';

  tensor_name?: string;
}

export interface DebuggerFrameData {
  step_count: number;

  event: 'call' | 'line' | 'return';

  source_line: string|null;

  filename: string;

  lineno: number;

  function_name: string;

  locals_summary?: VariableSummary[];
}

export type CodeLinesCallback = (lines: string[]) => Promise<void>|void;
export type FrameDataCallback =
    (frameData: DebuggerFrameData) => Promise<void>|void;
export type TensorValueCalblack =
    (tensorValue: TensorWireFormat) => Promise<void>|void;

// A cache used for async tensor value retrieval.
// const tensorCache: {[name: string]: TensorWireFormat} = {};

class CommHandler {
  private comm: any;
  private codeLinesCallback: CodeLinesCallback|null = null;
  private frameDataCallback: FrameDataCallback|null = null;
  private tensorValueCallback: TensorValueCalblack|null = null;

  constructor() {
    this.comm = null;
  }

  openComm() {
    if (Jupyter.notebook.kernel == null) {
      throw new Error('Jupyter notebook kernel is not available.');
    }
    this.comm = Jupyter.notebook.kernel.comm_manager.new_comm(
        'debugger_comm_target', {'foo': -1});
    // Register a message handler.
    this.comm.on_msg((msg: JupyterCommMessage) => {
      let data = msg.content.data;
      console.log('In on_msg(): data = ', data);  // DEBUG
      if ('code_lines' in data && this.codeLinesCallback != null) {
        this.codeLinesCallback(data['code_lines'] as string[]);
      } else if ('event' in data && this.frameDataCallback != null) {
        this.frameDataCallback(data as DebuggerFrameData);
      } else if ('local_names' in data) {
        // TODO(cais): Hook up with UI logic.
        console.log('Local names:', data);  // DEBUG
      } else if ('dtype' in data) {
        if (this.tensorValueCallback != null) {
          this.tensorValueCallback(data as TensorWireFormat);
        }
        // console.log('tensor wire format:', data);  // DEBUG
        // tensorCache[(data as TensorWireFormat).name] = data as TensorWireFormat;
      }
    });
  }

  sendMessage(action: DebuggerCommand) {
    this.comm.send(action);
  }

  registerFrameDataCallback(callback: FrameDataCallback) {
    this.frameDataCallback = callback;
  }

  registerCodeLinesCallback(callback: CodeLinesCallback) {
    this.codeLinesCallback = callback;
  }

  registerTensorValueCallback(callback: TensorValueCalblack) {
    this.tensorValueCallback = callback;
  }
}

class DebuggerCompoenent {
  private readonly codeDiv: HTMLDivElement;
  private readonly watchDiv: HTMLDivElement;
  private lineNum2Gutter: {[lineno: number]: HTMLDivElement} = {};
  private activeLineNum: number|null = null;

  private watchPanel: DebuggerWatchPanel;

  constructor(
      private rootDiv: HTMLDivElement,
      private codeLines: string[],
      private readonly requestTensorFucntion: RequestTensorFunction
      ) {
    this.codeLines = codeLines;
    this.rootDiv = rootDiv;

    this.codeDiv = document.createElement('div');
    this.codeDiv.classList.add('debugger-extension-code-div');
    this.rootDiv.appendChild(this.codeDiv);

    this.watchDiv = document.createElement('div');
    this.watchDiv.classList.add('debugger-extension-watch-panel');
    this.rootDiv.appendChild(this.watchDiv);

    this.watchPanel =
        new DebuggerWatchPanel(this.watchDiv, this.requestTensorFucntion);
  }

  public renderCodeLines(): void {
    this.codeLines.forEach((line, i) => {
      const lineElement = document.createElement('div');
      lineElement.classList.add('debugger-extension-code-line-container');

      const lineGutterElement = document.createElement('div');
      lineGutterElement.classList.add('debugger-extension-code-line-gutter');
      lineElement.appendChild(lineGutterElement);
      this.lineNum2Gutter[i + 1] = lineGutterElement;

      const lineNumElement = document.createElement('div');
      lineNumElement.textContent = `${i + 1}`;
      lineNumElement.classList.add('debugger-extension-code-line-num');
      lineElement.appendChild(lineNumElement);

      const lineCodeElement = document.createElement('div');
      lineCodeElement.classList.add('debugger-extension-code-line-code');
      lineCodeElement.innerHTML = toHTMLEntities(line);
      lineElement.appendChild(lineCodeElement);

      this.codeDiv.appendChild(lineElement);
    });
  }

  public setActiveLineNum(lineNum: number) {
    if (this.activeLineNum != null && this.activeLineNum !== lineNum) {
      this.lineNum2Gutter[this.activeLineNum].textContent = '';
    }
    this.activeLineNum = lineNum;
    this.lineNum2Gutter[lineNum].textContent = '▶';
  }

  public setLocalsSummary(localsSummary: VariableSummary[]) {
    this.watchPanel.renderVariablesSummary(localsSummary);
  }

  public renderTensorValue(tensorValue: TensorWireFormat) {
    const tensor =
        tf.tensor(tensorValue.values, tensorValue.shape, tensorValue.dtype);
    console.log('tensor value:');  // DEBUG
    tensor.print();  // DEBUG
    // if (rank === 0) {
    //     return tf.scalar(tensorValue.values as number, tensorValue.dtype);
    // } else if (rank === 1) {
    //     return tf.tensor1d(tensorValue.values as number[], tensorValue.dtype);
    // } else if (rank === 2) {
    //     return tf.tensor2d(
    //         tensorValue.values as number[][],
    //         tensorValue.shape as [number, number],
    //         tensorValue.dtype);
    // } else if (rank === 3) {
    //     return tf.tensor3d(
    //         tensorValue.values as number[][][],
    //         tensorValue.shape as [number, number, number],
    //         tensorValue.dtype);
    // } else if (rank === 4) {
    //     return tf.tensor4d(
    //         tensorValue.values as number[][][][],
    //         tensorValue.shape as [number, number, number, number],
    //         tensorValue.dtype);
    // } else if (rank === 5) {
    //     return tf.tensor5d(
    //         tensorValue.values as number[][][][][],
    //         tensorValue.shape as
    //             [number, number, number, number, number],
    //         tensorValue.dtype);
    // } else {
    //     throw new Error(`Unsupported rank %{rank}`);
    // }
  }
}



function main() {
  const extensionDiv =
      document.getElementById('extension-div') as HTMLDivElement;
  const componentDiv = document.createElement('div');
  componentDiv.textContent = 'Waiting for Python source code...';
  extensionDiv.appendChild(componentDiv);

  let debuggerComponent: DebuggerCompoenent;
  let comm: CommHandler;
  const stepButton =
      document.getElementById('step-button') as HTMLButtonElement;
  stepButton.addEventListener('click', () => {
    if (comm == null) {
      comm = new CommHandler();

      comm.registerCodeLinesCallback((codeLines: string[]) => {
        componentDiv.textContent = '';

        async function requestTensorFunction(name: string) {
          comm.sendMessage({
            command: 'get_tensor_value',
            tensor_name: name
          });
          // while (!(name in tensorCache)) {
          //   console.log(`Polling for name ${name}`);  // DEBUG
          //   await sleep(50);
          // }
          // const tensorWireFormat = tensorCache[name];
          // delete tensorCache[name];
          // resolve(tensorWireFormat);
          // resolve({  // TODO(cais): Replace dummy values with real ones.
          //   name,
          //   dtype: 'float32',
          //   shape: [2, 2],
          //   values: [1, 2, 30, 40]
          // });
        }

        debuggerComponent = new DebuggerCompoenent(
            componentDiv, codeLines, requestTensorFunction);
        debuggerComponent.renderCodeLines();
      });

      comm.registerFrameDataCallback((frameData: DebuggerFrameData) => {
        // console.log('frameData:', frameData);  // DEBUG
        if (!frameData.filename.startsWith('<ipython-input-')) {
          return;
        }
        debuggerComponent.setActiveLineNum(frameData.lineno);
        if (frameData.locals_summary != null) {
          debuggerComponent.setLocalsSummary(frameData.locals_summary);
        }
      });

      comm.registerTensorValueCallback(tensorValue => {
        debuggerComponent.renderTensorValue(tensorValue);
      });

      comm.openComm();
    }
    comm.sendMessage({command: 'step'});
  });
}

main();
