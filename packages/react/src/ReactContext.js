/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {REACT_PROVIDER_TYPE, REACT_CONTEXT_TYPE} from 'shared/ReactSymbols';

import type {ReactContext} from 'shared/ReactTypes';

import warningWithoutStack from 'shared/warningWithoutStack';
import warning from 'shared/warning';

import ReactRootList from './ReactRootList';

function contextDidUpdate<T>(context: ReactContext<T>, newValue: T) {
  context._currentValue = context._currentValue2 = newValue;
}

function setContext<T>(
  context: ReactContext<T>,
  newValue: T,
  userCallback: (() => mixed) | void | null,
): void {
  const oldValue = context._globalValue;
  context._globalValue = newValue;

  let wrappedCallback = null;

  if (userCallback !== null && userCallback !== undefined) {
    const cb = userCallback;
    // Use reference counting to wait until all roots have updated before
    // calling the callback.
    let numRootsThatNeedUpdate = 0;
    let root = ReactRootList.first;
    if (root !== null) {
      do {
        numRootsThatNeedUpdate += 1;
        root = root.nextGlobalRoot;
      } while (root !== null);
      wrappedCallback = committedValue => {
        numRootsThatNeedUpdate -= 1;
        if (numRootsThatNeedUpdate === 0) {
          contextDidUpdate(context, newValue);
          cb();
        }
      };
    } else {
      // There are no mounted roots. Fire the callback and exit.
      contextDidUpdate(context, newValue);
      userCallback();
      return;
    }
  } else {
    if (ReactRootList.first !== null) {
      wrappedCallback = contextDidUpdate.bind(null, context, newValue);
    } else {
      // There are no mounted roots. Exit.
      contextDidUpdate(context, newValue);
      return;
    }
  }

  // Schedule an update on each root. We do this in a separate loop from the
  // one above, because in sync mode, `setContext` may not be batched.
  let root = ReactRootList.first;
  while (root !== null) {
    // Pass the old value so React can calculate the changed bits
    root.setContext(context, oldValue, newValue, wrappedCallback);
    root = root.nextGlobalRoot;
  }
}

export function createContext<T>(
  defaultValue: T,
  calculateChangedBits: ?(a: T, b: T) => number,
): ReactContext<T> {
  if (calculateChangedBits === undefined) {
    calculateChangedBits = null;
  } else {
    if (__DEV__) {
      warningWithoutStack(
        calculateChangedBits === null ||
          typeof calculateChangedBits === 'function',
        'createContext: Expected the optional second argument to be a ' +
          'function. Instead received: %s',
        calculateChangedBits,
      );
    }
  }

  const context: ReactContext<T> = {
    $$typeof: REACT_CONTEXT_TYPE,
    _calculateChangedBits: calculateChangedBits,
    _globalValue: defaultValue,
    // As a workaround to support multiple concurrent renderers, we categorize
    // some renderers as primary and others as secondary. We only expect
    // there to be two concurrent renderers at most: React Native (primary) and
    // Fabric (secondary); React DOM (primary) and React ART (secondary).
    // Secondary renderers store their context values on separate fields.
    _currentValue: defaultValue,
    _currentValue2: defaultValue,
    // These are circular
    Provider: (null: any),
    Consumer: (null: any),
    unstable_set: (null: any),
  };

  context.Provider = {
    $$typeof: REACT_PROVIDER_TYPE,
    _context: context,
  };

  let hasWarnedAboutUsingNestedContextConsumers = false;
  let hasWarnedAboutUsingConsumerProvider = false;

  if (__DEV__) {
    // A separate object, but proxies back to the original context object for
    // backwards compatibility. It has a different $$typeof, so we can properly
    // warn for the incorrect usage of Context as a Consumer.
    const Consumer = {
      $$typeof: REACT_CONTEXT_TYPE,
      _context: context,
      _calculateChangedBits: context._calculateChangedBits,
    };
    // $FlowFixMe: Flow complains about not setting a value, which is intentional here
    Object.defineProperties(Consumer, {
      Provider: {
        get() {
          if (!hasWarnedAboutUsingConsumerProvider) {
            hasWarnedAboutUsingConsumerProvider = true;
            warning(
              false,
              'Rendering <Context.Consumer.Provider> is not supported and will be removed in ' +
                'a future major release. Did you mean to render <Context.Provider> instead?',
            );
          }
          return context.Provider;
        },
        set(_Provider) {
          context.Provider = _Provider;
        },
      },
      _currentValue: {
        get() {
          return context._currentValue;
        },
        set(_currentValue) {
          context._currentValue = _currentValue;
        },
      },
      _currentValue2: {
        get() {
          return context._currentValue2;
        },
        set(_currentValue2) {
          context._currentValue2 = _currentValue2;
        },
      },
      Consumer: {
        get() {
          if (!hasWarnedAboutUsingNestedContextConsumers) {
            hasWarnedAboutUsingNestedContextConsumers = true;
            warning(
              false,
              'Rendering <Context.Consumer.Consumer> is not supported and will be removed in ' +
                'a future major release. Did you mean to render <Context.Consumer> instead?',
            );
          }
          return context.Consumer;
        },
      },
    });
    // $FlowFixMe: Flow complains about missing properties because it doesn't understand defineProperty
    context.Consumer = Consumer;
  } else {
    context.Consumer = context;
  }
  context.unstable_set = setContext.bind(null, context);

  if (__DEV__) {
    context._currentRenderer = null;
    context._currentRenderer2 = null;
  }

  return context;
}
