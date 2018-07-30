function normalize(x) {
  return tf.tidy(() => {
    const mean = tf.mean(x);
    const std = tf.sqrt(tf.mean(tf.square(tf.add(x, tf.neg(mean)))));
    return tf.div(tf.add(x, tf.neg(mean)), std);
  });
}
