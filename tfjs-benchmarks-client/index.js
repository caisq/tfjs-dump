const taskList = document.getElementById('task-list');

async function run() {
  await firebase.initializeApp({
      authDomain: 'jstensorflow.firebaseapp.com',
      projectId: 'jstensorflow'
  });
  const db = firebase.firestore();
  console.log('initializeApp DONE');

  async function getAllTasks() {
    const query = db.collection('Tasks').where('taskType', '==', 'model');
    const listItems = {};
    query.get().then(querySnapshot => {
      const modelAndFunctions = [];
      querySnapshot.forEach(doc => {
        const data = doc.data();
        modelAndFunctions.push([data.taskName, data.functionName]);
      });
      modelAndFunctions.sort();
      modelAndFunctions.forEach(modelAndFunction => {
        const [modelName, functionName] = modelAndFunction;

        if (listItems[modelName] == null) {
          const modelItem = document.createElement('li');
          listItems[modelName] = (modelItem);
          const modelNameSpan = document.createElement('span');
          modelNameSpan.classList.add('model-name-span');
          modelNameSpan.textContent = modelName;
          modelItem.appendChild(modelNameSpan);
        }

        const functionSpan = document.createElement('span');
        functionSpan.attributes['modelName'] = modelName;
        functionSpan.attributes['functionName'] = functionName;
        functionSpan.classList.add('function-name-span');
        functionSpan.textContent = functionName;
        functionSpan.addEventListener('click', async event => {
          const modelName = event.srcElement.attributes['modelName'];
          const functionName = event.srcElement.attributes['functionName'];
          const {
            endingTimestampMs,
            averageTimeMs,
            environmentTypes,
            hostNames
          } = await getTimingData(modelName, functionName);
          const endingDateTimes = endingTimestampMs.map(t => new Date(t));

          const dataByEnvAndHost = {};
          let maxAverageTimeMs = -Infinity;
          for (let i = 0; i < environmentTypes.length; ++i) {
            if (environmentTypes[i] == null || hostNames[i] == null) {
              continue;
            }
            const envAndHost = `${environmentTypes[i]}@${hostNames[i]}`;
            if (!(envAndHost in dataByEnvAndHost)) {
              dataByEnvAndHost[envAndHost] = {
                x: [],
                y: [],
                type: 'scatter',
                name: envAndHost
              };
            }
            dataByEnvAndHost[envAndHost].x.push(endingDateTimes[i]);
            dataByEnvAndHost[envAndHost].y.push(averageTimeMs[i]);
            if (averageTimeMs[i] > maxAverageTimeMs) {
              maxAverageTimeMs = averageTimeMs[i];
            }
          }

          const dataArray = [];
          for (const envAndHost in dataByEnvAndHost) {
            dataArray.push(dataByEnvAndHost[envAndHost]);
          }

          const yRange = Number.isFinite(maxAverageTimeMs) ?
              [0, maxAverageTimeMs * 1.35] : null;
          Plotly.newPlot('main-plot', dataArray, {
            title: {text: `${modelName}.${functionName}`},
            xaxis: {title: {text: 'Date Time'}},
            yaxis: {
              title: {text: 'Average Time (ms)'},
              range: yRange
            }
          });
        });
        listItems[modelName].appendChild(functionSpan);
      });

      for (const key in listItems) {
        taskList.appendChild(listItems[key]);
      }
    });
  }
  await getAllTasks();

  let environmentInfoCache = {};
  async function batchGetEnvironmentInfo(ids) {
    let unknownIds = [];
    ids.forEach(id => {
      if (!(id in environmentInfoCache)) {
        unknownIds.push(id);
      }
    });
    if (unknownIds.length > 0) {
      const collection = db.collection('Environments');
      console.log(`** Downloading environmentInfo for ${ids.length} ids **`);
      const docPromises = ids.map(id => collection.doc(id).get());
      const docs = await Promise.all(docPromises);
      docs.forEach(doc => environmentInfoCache[doc.id] = doc.data());
    }
    return ids.map(id => environmentInfoCache[id]);
  }

  function parseHostName(environmentInfo) {
    if (environmentInfo == null) {
      return null;
    }
    if (environmentInfo.systemInfo == null) {
      return null;
    }
    return environmentInfo.systemInfo.split(' ')[1];
  }

  async function getTimingData(modelName, functionName) {
    return new Promise((resolve, reject) => {
      const query = db.collection('BenchmarkRuns')
          .where('modelName', '==', modelName)
          .where('functionName', '==', functionName)
          .orderBy('endingTimestampMs');
      query.get().then(async querySnapshot => {
        const endingTimestampMs = [];
        const averageTimeMs = [];
        const environmentIds = [];
        const environmentTypes = [];
        const hostNames = [];
        querySnapshot.forEach(async doc => {
          const data = doc.data();
          endingTimestampMs.push(data.endingTimestampMs);
          averageTimeMs.push(data.averageTimeMs);
          environmentIds.push(data.environmentId);
        });

        const infoItems = await batchGetEnvironmentInfo(environmentIds);
        for (let i = 0; i < environmentIds.length; ++i) {
          const environmentInfo = infoItems[i];
          environmentTypes.push(
              environmentInfo == null ? null : environmentInfo.type);
          hostNames.push(parseHostName(environmentInfo));
        }
        resolve({
          endingTimestampMs,
          averageTimeMs,
          environmentTypes,
          hostNames
        });
      }).catch(error => reject(error));
    });
  }
}
run();