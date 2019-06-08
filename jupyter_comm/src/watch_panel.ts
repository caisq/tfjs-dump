import {Tensor} from '@tensorflow/tfjs-core';
import * as tensorWidget from 'tensor-widget';

import {toHTMLEntities} from "./string_utils";

/** Summary of a single variable. */
export interface VariableSummary {
    name: string;
    type: string;

    /**
     * Value snapshot.
     *
     * Only available for simple, primitive types such as int, float, and
     * strings.
     *
     * In the case of strings, if the length is too large, the tail part will
     * be omitted.
     */
    snapshot: string;

    is_tensor: boolean;
}

export interface TensorWireFormat {
    name: string;

    // TODO(cais): What if Python TensorFlow provides other dtypes?
    dtype: 'int32'|'float32'|'bool'|'string';
    shape: number[];
    values: number|number[]|number[][]|number[][][]|
            number[][][][]|number[][][][][];
}

export function formatTypeNameForDisplay(typeName: string): string {
    const CLASS_PREFIX = '<class \'';
    const CLASS_SUFFIX = '\'>';
    if (typeName.startsWith(CLASS_PREFIX) && typeName.endsWith(CLASS_SUFFIX)) {
        return typeName.slice(
            CLASS_PREFIX.length, typeName.length - CLASS_SUFFIX.length);
    } else {
        return typeName;
    }
}

export type RequestTensorFunction = (name: string) => Promise<void>;

export class DebuggerWatchPanel {
    private variableListPanel: HTMLDivElement;
    private tensorWidgetPanel: HTMLDivElement;

    constructor(
        private readonly rootDiv: HTMLDivElement,
        private readonly retrieveTensorFunction: RequestTensorFunction) {
        this.variableListPanel = document.createElement('div');
        this.variableListPanel.classList.add('debugger-extension-tensor-variable-list');
        this.rootDiv.appendChild(this.variableListPanel);
        this.tensorWidgetPanel = document.createElement('div');
        this.tensorWidgetPanel.classList.add('debugger-extension-tensor-widget-panel');
        this.rootDiv.appendChild(this.tensorWidgetPanel);
    }

    public renderVariablesSummary(summary: VariableSummary[]) {
        // Clear the div.
        while(this.variableListPanel.firstChild != null) {
            this.variableListPanel.removeChild(this.variableListPanel.firstChild);
        }
        this.addHeaderRow();

        summary.forEach(variable => {
            const variableDiv = document.createElement('div');
            variableDiv.classList.add('debugger-extension-variable-row');

            const nameDiv = document.createElement('div');
            nameDiv.classList.add('debugger-extension-variable-name');
            nameDiv.textContent = variable.name;
            variableDiv.appendChild(nameDiv);

            const typeDiv = document.createElement('div');
            typeDiv.classList.add('debugger-extension-variable-type');
            typeDiv.textContent = formatTypeNameForDisplay(variable.type);
            variableDiv.appendChild(typeDiv);

            const snapshotDiv = document.createElement('div');
            snapshotDiv.classList.add('debugger-extension-variable-snapshot');
            if (variable.is_tensor) {
                const viewButton = document.createElement('a');
                viewButton.classList.add(
                    'debugger-extensoin-tensor-view-button');
                viewButton.textContent = variable.snapshot;
                viewButton.addEventListener('click', async () => {
                    this.requestTensorValue(variable.name);
                });

                snapshotDiv.append(viewButton);
            } else {
                if (variable.snapshot != null) {
                    snapshotDiv.innerHTML = toHTMLEntities(variable.snapshot);
                } else {
                    snapshotDiv.innerHTML = 'N/A';
                }
            }
            variableDiv.appendChild(snapshotDiv);

            this.variableListPanel.appendChild(variableDiv);
        });
    }

    private requestTensorValue(name: string) {
        if (this.retrieveTensorFunction == null) {
            throw new Error(
                'Cannot retrieve tensor value because no ' +
                'retrieveTensorFunction is defined');
        } else {
            this.retrieveTensorFunction(name);
        }
    }

    private addHeaderRow() {
        const variableHeaderRow = document.createElement('div');
        variableHeaderRow.classList.add('debugger-extension-variable-header');

        const nameHeader = document.createElement('div');
        nameHeader.classList.add('debugger-extension-variable-name');
        nameHeader.textContent = 'Name';
        variableHeaderRow.appendChild(nameHeader);

        const typeHeader = document.createElement('div');
        typeHeader.classList.add('debugger-extension-variable-type');
        typeHeader.textContent = 'Type'
        variableHeaderRow.appendChild(typeHeader);

        const snapshotDiv = document.createElement('div');
        snapshotDiv.classList.add('debugger-extension-variable-snapshot');
        snapshotDiv.textContent = 'Value';
        variableHeaderRow.appendChild(snapshotDiv);

        this.variableListPanel.appendChild(variableHeaderRow);
    }

    public renderTensor(tensor: Tensor) {
        while (this.tensorWidgetPanel.firstChild) {
            this.tensorWidgetPanel.removeChild(this.tensorWidgetPanel.firstChild);
        }
        new tensorWidget.TensorVisPanel(this.tensorWidgetPanel, tensor);
    }
}
