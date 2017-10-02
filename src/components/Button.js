//@flow
import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';

const Button = ({ text, disabled, onPress, style }) => {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled}>
      <View style={[styles.button, style]}>
        <Text style={styles.text}>{text}</Text>
      </View>
    </TouchableOpacity>
  );
};

Button.propTypes = {
  text: PropTypes.string.isRequired,
  onPress: PropTypes.func.isRequired
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 3,
    backgroundColor: 'green',
    alignItems: 'center'
  },
  text: {
    color: 'white',
    fontSize: 14,
    marginVertical: 16
  }
});

export default Button;
