package com.dispatchlab.api.simulation;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SimulationRabbitConfig {
    public static final String EXCHANGE = "dispatchlab.simulations";
    public static final String QUEUE = "dispatchlab.simulations.queue";
    public static final String ROUTING_KEY = "simulation.execute";

    @Bean
    DirectExchange simulationExchange() {
        return new DirectExchange(EXCHANGE, true, false);
    }

    @Bean
    Queue simulationQueue() {
        return new Queue(QUEUE, true);
    }

    @Bean
    Binding simulationBinding(Queue simulationQueue, DirectExchange simulationExchange) {
        return BindingBuilder.bind(simulationQueue)
            .to(simulationExchange)
            .with(ROUTING_KEY);
    }
}
