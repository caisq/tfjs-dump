import * as tf from '@tensorflow/tfjs-core';

import {JupyterClass, JupyterCommMessage} from './jupyter_types';
import {convertLeadingEntities} from './string_utils';
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

export type CodeHtmlCallback = (htmlText: string) => Promise<void>|void;
export type FrameDataCallback =
    (frameData: DebuggerFrameData) => Promise<void>|void;
export type TensorValueCalblack =
    (tensorValue: TensorWireFormat) => Promise<void>|void;

// A cache used for async tensor value retrieval.
// const tensorCache: {[name: string]: TensorWireFormat} = {};

class CommHandler {
  private comm: any;
  private codeHtmlCallback: CodeHtmlCallback|null = null;
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
        'debugger_comm_target', {});
    // Register a message handler.
    this.comm.on_msg((msg: JupyterCommMessage) => {
      let data = msg.content.data;
      // console.log('In on_msg(): data = ', data);  // DEBUG
      if ('code_html' in data && this.codeHtmlCallback != null) {
        this.codeHtmlCallback(data['code_html'] as string);

        // This is the initial connect. Automatically step
      } else if ('event' in data && this.frameDataCallback != null) {
        this.frameDataCallback(data as DebuggerFrameData);
      } else if ('local_names' in data) {
        // TODO(cais): Hook up with UI logic.
        // console.log('Local names:', data);  // DEBUG
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

  registerCodeLinesCallback(callback: CodeHtmlCallback) {
    this.codeHtmlCallback = callback;
  }

  registerTensorValueCallback(callback: TensorValueCalblack) {
    this.tensorValueCallback = callback;
  }
}

// TODO(cais): Refactor into a separate file.
class DebuggerCompoenent {
  private readonly codeDiv: HTMLDivElement;
  private readonly watchDiv: HTMLDivElement;
  private lineNum2Gutter: {[lineno: number]: HTMLDivElement} = {};
  private activeLineNum: number|null = null;

  private watchPanel: DebuggerWatchPanel;

  // TODO(cais): In addition to indexing by lineno, we also need to
  // index by file name at a higher level.
  private linenoToTokenNameToSpan:
      {[lineno: number]: {[tokenName: string]: HTMLSpanElement}} = {};
  private activeTensorTokensSpans: {[tokenName: string]: HTMLSpanElement[]} = {};

  constructor(
      private rootDiv: HTMLDivElement,
      private codeHtml: string,
      private readonly requestTensorFucntion: RequestTensorFunction) {
    this.codeHtml = codeHtml;
    this.rootDiv = rootDiv;

    this.codeDiv = document.createElement('div');
    this.codeDiv.classList.add('debugger-extension-code-div');
    this.codeDiv.classList.add('highlight');
    this.rootDiv.appendChild(this.codeDiv);

    this.watchDiv = document.createElement('div');
    this.watchDiv.classList.add('debugger-extension-watch-panel');
    this.rootDiv.appendChild(this.watchDiv);

    this.watchPanel =
        new DebuggerWatchPanel(this.watchDiv, this.requestTensorFucntion);
  }

  public renderCodeLines(): void {
    const htmlLines = this.codeHtml.split('\n');
    htmlLines.forEach((line, i) => {
      const lineElement = document.createElement('div');
      lineElement.classList.add('debugger-extension-code-line-container');

      const lineGutterElement = document.createElement('div');
      lineGutterElement.classList.add('debugger-extension-code-line-gutter');
      lineElement.appendChild(lineGutterElement);
      this.lineNum2Gutter[i + 1] = lineGutterElement;

      const lineNumElement = document.createElement('div');
      const lineno = i +  1;
      lineNumElement.textContent = `${lineno}`;
      lineNumElement.classList.add('debugger-extension-code-line-num');
      lineElement.appendChild(lineNumElement);

      const lineCodeElement = document.createElement('div');
      lineCodeElement.classList.add('debugger-extension-code-line-code');
      lineCodeElement.innerHTML = convertLeadingEntities(line);

      this.collectLexerTokenSpans(lineno, lineCodeElement);
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

    // Highlight tensors in the code div.
    const activeTensorTokenNames: string[] = [];
    localsSummary.forEach(varSummary => {
      if (varSummary.is_tensor) {
        activeTensorTokenNames.push(varSummary.name);
      }
    });
    // TODO(cais): For frames with event = enter, f_locals may not be correct.

    for (const lineno in this.linenoToTokenNameToSpan) {
      for (const tokenName in this.linenoToTokenNameToSpan[lineno]) {
        // TODO(cais): Need a lineToFuncion map and make sure that the function
        // of the line that corresponds to `lineno` matches the current function
        // scope. This is important for cases where there are multiple functions
        // containing the same variable names.
        if (activeTensorTokenNames.indexOf(tokenName) !== -1) {
          const span = this.linenoToTokenNameToSpan[lineno][tokenName];
          span.classList.add('active-tensor');
          span.addEventListener('click', () => {
            this.requestTensorFucntion(tokenName);
          });
          if (this.activeTensorTokensSpans[tokenName] == null) {
            this.activeTensorTokensSpans[tokenName] = [];
          }
          this.activeTensorTokensSpans[tokenName].push(span);
        }
      }
    }

    // Remove the active-tensor status of tensors that are no longer active.
    for (const tokenName in this.activeTensorTokensSpans) {
      if (activeTensorTokenNames.indexOf(tokenName) === -1) {
        this.activeTensorTokensSpans[tokenName].forEach(span => {
          span.classList.remove ('active-tensor');
          // TODO(cais): Remove click event listener.
        })
        delete this.activeTensorTokensSpans[tokenName];
      }
    }
  }

  public renderTensorValue(tensorValue: TensorWireFormat) {
    const tensor =
        tf.tensor(tensorValue.values, tensorValue.shape, tensorValue.dtype);
    this.watchPanel.renderTensor(tensor);
    // TODO(cais): Tensor disposal. Prevent memory leaks.
  }

  /**
   * Collect a map for tokens as spans.
   */
  private collectLexerTokenSpans(
      lineno: number, lineCodeElement: HTMLDivElement) {
    lineCodeElement.childNodes.forEach(element => {
      if (element instanceof HTMLSpanElement) {
        if (element.classList.contains('n')) {
          if (!(lineno in this.linenoToTokenNameToSpan)) {
            this.linenoToTokenNameToSpan[lineno] = {};
          }
          const tokenName = element.textContent;
          if (tokenName != null) {
            this.linenoToTokenNameToSpan[lineno][tokenName] = element;
          }
        }
      }
    });
  }
}

function main() {
  const extensionDiv =
      document.getElementById('extension-div') as HTMLDivElement;
  const componentDiv = document.createElement('div');
  componentDiv.textContent = 'Waiting for Python source code...';
  extensionDiv.appendChild(componentDiv);

  let debuggerComponent: DebuggerCompoenent;
  const stepButton =
      document.getElementById('step-button') as HTMLButtonElement;

  // The comm objec that underlies the debugger.
  // TODO(cais): Handle the case in which the debugger magic is executed
  // more than once for the same Jupyter cell.
  const comm = new CommHandler();

  // Register the callback for code lines.
  comm.registerCodeLinesCallback((codeHtml: string) => {
    componentDiv.textContent = '';
    async function requestTensorFunction(name: string) {
      comm.sendMessage({
        command: 'get_tensor_value',
        tensor_name: name
      });
    }

    debuggerComponent = new DebuggerCompoenent(
        componentDiv, codeHtml, requestTensorFunction);
    debuggerComponent.renderCodeLines();
  });

  // Register the callback for Python debugger frames.
  comm.registerFrameDataCallback((frameData: DebuggerFrameData) => {
    if (!frameData.filename.startsWith('<ipython-input-')) {
      return;
    }
    debuggerComponent.setActiveLineNum(frameData.lineno);
    if (frameData.locals_summary != null) {
      debuggerComponent.setLocalsSummary(frameData.locals_summary);
    }
  });

  // Register the callback for TensorFlow (eager) Tensor values.
  comm.registerTensorValueCallback(tensorValue => {
    debuggerComponent.renderTensorValue(tensorValue);
  });

  // Open the debugger's underlying comm.
  comm.openComm();

  // Initial step, so that the debugger can stop at the first line
  // of the cell.
  comm.sendMessage({command: 'step'});

  stepButton.addEventListener('click', () => {
    comm.sendMessage({command: 'step'});
  });
}

main();
