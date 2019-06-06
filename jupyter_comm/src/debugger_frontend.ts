import {JupyterClass, JupyterCommMessage} from './jupyter_types';
import {toHTMLEntities} from './string_utils';

declare const Jupyter: JupyterClass;

console.log('In debugger_frontend.ts');  // DEBUG

export interface DebuggerFrameData {
  step_count: number;

  event: 'call' | 'line' | 'return';

  source_line: string|null;

  filename: string;

  lineno: number;

  function_name: string;
}

export type CodeLinesCallback = (lines: string[]) => Promise<void>|void;
export type FrameDataCallback =
    (frameData: DebuggerFrameData) => Promise<void>|void;

class CommHandler {
  private comm: any;
  private codeLinesCallback: CodeLinesCallback|null = null;
  private frameDataCallback: FrameDataCallback|null = null;


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
      const data = msg.content.data;
      console.log('In on_msg(): data = ', data);  // DEBUG
      if ('code_lines' in data && this.codeLinesCallback != null) {
        this.codeLinesCallback(data['code_lines'] as string[]);
      } else if ('event' in data && this.frameDataCallback != null) {
        this.frameDataCallback(data as DebuggerFrameData);
      }
    });
  }

  sendMessage(msg: {}) {
    this.comm.send(msg);
  }

  registerFrameDataCallback(callback: FrameDataCallback) {
    this.frameDataCallback = callback;
  }

  registerCodeLinesCallback(callback: CodeLinesCallback) {
    this.codeLinesCallback = callback;
  }
}

class DebuggerCompoenent {
  private readonly rootDiv: HTMLDivElement;
  private readonly codeLines: string[];
  private lineNum2Gutter: {[lineno: number]: HTMLDivElement} = {};
  private activeLineNum: number|null = null;

  constructor(rootDiv: HTMLDivElement, codeLines: string[]) {
    this.rootDiv = rootDiv;
    this.codeLines = codeLines;
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

      this.rootDiv.appendChild(lineElement);
    });
  }

  public setActiveLineNum(lineNum: number) {
    if (this.activeLineNum != null && this.activeLineNum !== lineNum) {
      this.lineNum2Gutter[this.activeLineNum].textContent = '';
    }
    this.activeLineNum = lineNum;
    console.log(`this.activeLineNum = ${this.activeLineNum}`);  // DEBUG
    this.lineNum2Gutter[lineNum].textContent = '▶';
  }
}

function main() {
  const extensionDiv =
      document.getElementById('extension-div') as HTMLDivElement;
  const codeDiv = document.createElement('div');
  codeDiv.textContent = 'Waiting for Python source code...';
  extensionDiv.appendChild(codeDiv);

  let debuggerComponent: DebuggerCompoenent;
  let comm: CommHandler;
  const stepButton =
      document.getElementById('step-button') as HTMLButtonElement;
  stepButton.addEventListener('click', () => {
    if (comm == null) {
      comm = new CommHandler();

      comm.registerCodeLinesCallback((codeLines: string[]) => {
        codeDiv.textContent = '';
        debuggerComponent = new DebuggerCompoenent(codeDiv, codeLines);
        debuggerComponent.renderCodeLines();
      });

      comm.registerFrameDataCallback((frameData: DebuggerFrameData) => {
        console.log('frameData:', frameData);  // DEBUG
        if (!frameData.filename.startsWith('<ipython-input-')) {
          return;
        }
        debuggerComponent.setActiveLineNum(frameData.lineno);
        // stepButton.textContent = `Incoming value: ${JSON.stringify(incomingValue)}`;
      });
      comm.openComm();
    }
    comm.sendMessage({});
  });
}

main();
