import {JupyterClass, JupyterCommMessage} from './jupyter_types';
import {toHTMLEntities} from './string_utils';
import {DebuggerWatchPanel, VariableSummary} from './watch_panel';

declare const Jupyter: JupyterClass;

console.log('In debugger_frontend.ts');  // DEBUG

export interface DebuggerCommand {
  command: 'step';
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
      } else if ('local_names' in data) {
        // TODO(cais): Hook up with UI logic.
        console.log('Local names:', data);  // DEBUG
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
}

class DebuggerCompoenent {
  private readonly rootDiv: HTMLDivElement;
  private readonly codeDiv: HTMLDivElement;
  private readonly watchDiv: HTMLDivElement;
  private readonly codeLines: string[];
  private lineNum2Gutter: {[lineno: number]: HTMLDivElement} = {};
  private activeLineNum: number|null = null;

  private watchPanel: DebuggerWatchPanel;

  constructor(rootDiv: HTMLDivElement, codeLines: string[]) {
    this.codeLines = codeLines;
    this.rootDiv = rootDiv;

    this.codeDiv = document.createElement('div');
    this.codeDiv.classList.add('debugger-extension-code-div');
    this.rootDiv.appendChild(this.codeDiv);

    this.watchDiv = document.createElement('div');
    this.watchDiv.classList.add('debugger-extension-watch-panel');
    this.rootDiv.appendChild(this.watchDiv);

    this.watchPanel = new DebuggerWatchPanel(this.watchDiv);
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
        debuggerComponent = new DebuggerCompoenent(componentDiv, codeLines);
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
      comm.openComm();
    }
    comm.sendMessage({command: 'step'});
  });
}

main();
