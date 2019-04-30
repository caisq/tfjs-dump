import numpy as np
import scipy
from matplotlib import pyplot as plt


def discount_rewards(rs, discount_rate):
  discounted = np.zeros([len(rs)])
  prev = 0
  i = len(rs) - 1
  while i >= 0:
    current = discount_rate * prev + rs[i]
    discounted[i] = current
    prev = current
    i -= 1
  return discounted


def normalize_rewards(reward_arrays):
  concatenated = np.concatenate(reward_arrays)
  mean = np.mean(concatenated)
  std = np.std(concatenated)
  return [(array - mean) / std for array in reward_arrays]


def display(r, discount_rate):
  plt.figure()
  plt.subplot(2, 1, 1)
  plt.stem(r)
  plt.grid('on')
  plt.xticks([])
  plt.ylabel('Original reward')
  plt.title('Original rewards')

  plt.subplot(2, 1, 2)
  plt.stem(discount_rewards(r, discount_rate))
  plt.grid('on')
  plt.xticks(range(0, len(r)))
  plt.ylabel('Discounted reward')
  plt.xlabel('step')
  plt.title('Discounted rewards')


discount_rate = 0.95

r1 = np.array([1.0] * 4)
display(r1, discount_rate)

r2 = np.array([1.0] * 20)
display(r2, discount_rate)

r1_discounted = discount_rewards(r1, discount_rate)
r2_discounted = discount_rewards(r2, discount_rate)
normalized = normalize_rewards([r1_discounted, r2_discounted])
print(normalized)

plt.figure()
plt.stem(normalized[0], 'b', 'bo')
plt.hold(True)
plt.stem(normalized[1], 'g', 'gs')
plt.legend(['length=4', 'length=20'])
plt.grid('on')
plt.xticks(range(0, len(normalized[1])))
plt.xlabel('step')
plt.ylabel('Normalized discounted reward')

plt.show()
